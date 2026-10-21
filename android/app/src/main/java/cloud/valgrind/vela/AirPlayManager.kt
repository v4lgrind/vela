package cloud.valgrind.vela

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.TeeAudioProcessor
import java.io.File
import java.io.OutputStream
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sends the music player's output to an AirPlay receiver through cliairplay
 * (music-assistant/airplay-cli, built by native/airplay and shipped as
 * libcliairplay.so).
 *
 * The music keeps being decoded by MusicService's ExoPlayer: a tee at the end
 * of its audio processor chain (resampled to 44.1 kHz) copies the PCM into
 * cliairplay's stdin while the local output is muted. Transport and metadata
 * go through cliairplay's command pipe. Android won't let an app bind the PTP
 * ports, so sessions run on cliairplay's NTP timing fallback.
 */
object AirPlayManager {
    private const val TAG = "AirPlay"
    private const val SAMPLE_RATE = 44100
    private const val BYTES_PER_SECOND = SAMPLE_RATE * 4 // s16le stereo
    private const val MAX_QUEUED_BYTES = BYTES_PER_SECOND * 4
    private const val PREFS = "airplay"

    data class Device(val id: String, val name: String, val host: String, val port: Int, val txt: Map<String, String>) {
        /** Apple TVs only stream after a one-time PIN pairing; other receivers pair transiently. */
        val needsPin: Boolean get() = txt["model"]?.startsWith("AppleTV") == true
    }

    interface Listener {
        fun onStateChanged(state: String, device: Device?, error: String?)
    }

    var listener: Listener? = null

    // Audio processors spliced into MusicService's audio sink. Inactive (pass
    // through) unless a session is up.
    val resampler = SonicAudioProcessor()
    val tee = TeeAudioProcessor(object : TeeAudioProcessor.AudioBufferSink {
        override fun flush(sampleRateHz: Int, channelCount: Int, encoding: Int) =
            onSinkFlush(sampleRateHz, channelCount, encoding)

        override fun handleBuffer(buffer: ByteBuffer) = onPcm(buffer)
    })

    private val mainHandler = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var session: Session? = null
    /** Device whose session cliairplay ended after its idle timeout; reconnected on play. */
    private var standby: Device? = null
    private var appContext: Context? = null
    private var airplayVolume = 50
    private var pairing: Process? = null
    private var localVolume = 1f

    /** Mirrors player.isPlaying for the I/O threads (the player is main-thread only). */
    @Volatile private var playing = false
    @Volatile private var sinkRate = 0
    @Volatile private var sinkChannels = 0
    @Volatile private var sinkEncoding = C.ENCODING_INVALID

    private class Session(val device: Device, val process: Process, val cmdPipe: File) {
        val audio = LinkedBlockingDeque<ByteArray>()
        val queuedBytes = AtomicInteger()
        val commands = LinkedBlockingQueue<String>()
        @Volatile var started = false
        /** cliairplay reported audio buffered for the current feed (once per start cycle). */
        @Volatile var buffered = false
        @Volatile var idleTimedOut = false
        @Volatile var closed = false
    }

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            playing = isPlaying
            if (isPlaying && session == null) standby?.let { device -> appContext?.let { spawn(it, device) } }
            val s = session ?: return
            // Paused: drop what the receiver queued so it stops right away;
            // the next feed is started again once buffered.
            if (!isPlaying && s.started) flush(s)
            // Connected while paused: the feed was buffered before playback began.
            if (isPlaying) startIfReady(s)
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            session?.let { sendMetadata(it) }
        }
    }

    fun binary(context: Context): File = File(context.applicationInfo.nativeLibraryDir, "libcliairplay.so")

    fun isSupported(context: Context) = binary(context).canExecute()

    // --- Called by MusicService ---

    fun attach(exoPlayer: ExoPlayer) {
        player = exoPlayer
        playing = exoPlayer.isPlaying
        exoPlayer.addListener(playerListener)
    }

    fun detach(exoPlayer: ExoPlayer) {
        if (player !== exoPlayer) return
        disconnect()
        exoPlayer.removeListener(playerListener)
        player = null
    }

    // --- Pairing (Apple TV PIN) ---

    /** Starts HomeKit pair-setup; [onPinRequested] fires once the device shows its PIN. */
    fun startPairing(context: Context, device: Device, onPinRequested: () -> Unit, onDone: (Boolean, String?) -> Unit) {
        cancelPairing()
        val process = try {
            ProcessBuilder(binary(context).path, "--pair-setup", "--port", device.port.toString(),
                "--dacp", dacpId(context), device.host).start()
        } catch (e: Exception) {
            onDone(false, e.message)
            return
        }
        pairing = process
        var credentials: String? = null
        thread("airplay-pair-err") {
            process.errorStream.bufferedReader().forEachLine { line ->
                Log.d(TAG, "pair: $line")
                if (line.contains("Enter the PIN")) mainHandler.post(onPinRequested)
            }
        }
        thread("airplay-pair-out") {
            process.inputStream.bufferedReader().forEachLine { line ->
                if (line.startsWith("CREDENTIALS:")) credentials = line.substringAfter(':').trim()
            }
            val ok = process.waitFor() == 0 && credentials != null
            if (ok) prefs(context).edit().putString("creds:${device.id}", credentials).apply()
            mainHandler.post {
                if (pairing === process) pairing = null
                onDone(ok, if (ok) null else "Pairing failed")
            }
        }
    }

    fun submitPin(pin: String): Boolean {
        val stdin = pairing?.outputStream ?: return false
        return try {
            stdin.write("${pin.filter(Char::isDigit)}\n".toByteArray())
            stdin.flush()
            true
        } catch (e: Exception) {
            false
        }
    }

    fun cancelPairing() {
        pairing?.destroy()
        pairing = null
    }

    fun isPaired(context: Context, device: Device) = prefs(context).contains("creds:${device.id}")

    // --- Streaming session ---

    /** Main thread. Starts streaming the player's output to [device]. */
    fun connect(context: Context, device: Device, volume: Int) {
        disconnect()
        val exo = player ?: run { emit("error", device, "Music player not running"); return }
        appContext = context.applicationContext
        airplayVolume = volume.coerceIn(0, 100)
        if (!spawn(context, device)) return

        // Route the player into the tee: resample to 44.1 kHz and mute the
        // local output. Re-preparing makes the audio sink pick up the change.
        localVolume = exo.volume
        exo.volume = 0f
        resampler.setOutputSampleRateHz(SAMPLE_RATE)
        reconfigure(exo)
    }

    /** Starts a cliairplay process for [device]; the player routing is left as is. */
    private fun spawn(context: Context, device: Device): Boolean {
        standby = null
        val cmdPipe = File(context.cacheDir, "airplay.cmd").apply { delete() }
        val args = mutableListOf(
            binary(context).path, "--protocol", "auto", "--port", device.port.toString(),
            "--dacp", dacpId(context), "--volume", airplayVolume.toString(),
            "--cmdpipe", cmdPipe.path, "--name", "Vela",
            "--txt", device.txt.entries.joinToString(" ") { "${it.key}=${it.value}" },
        )
        prefs(context).getString("creds:${device.id}", null)?.let { args += listOf("--auth", it) }
        args += device.host

        val process = try {
            ProcessBuilder(args).directory(context.cacheDir).start()
        } catch (e: Exception) {
            emit("error", device, e.message)
            return false
        }
        val s = Session(device, process, cmdPipe)
        session = s
        emit("connecting", device, null)
        startIo(s)
        sendMetadata(s)
        return true
    }

    /** Main thread. Ends the session and gives the sound back to the device. */
    fun disconnect() {
        val s = session
        val device = s?.device ?: standby ?: return
        session = null
        standby = null
        s?.let {
            it.closed = true
            it.commands.offer("ACTION=DISCONNECT")
            mainHandler.postDelayed({ it.process.destroy() }, 2000)
        }
        restoreLocalOutput()
        emit("disconnected", device, null)
    }

    fun setVolume(volume: Int) {
        airplayVolume = volume.coerceIn(0, 100)
        session?.commands?.offer("VOLUME=$airplayVolume")
    }

    fun currentDevice(): Device? = session?.device ?: standby

    private fun restoreLocalOutput() {
        player?.let { exo ->
            resampler.setOutputSampleRateHz(SonicAudioProcessor.SAMPLE_RATE_NO_CHANGE)
            exo.volume = localVolume
            reconfigure(exo)
        }
    }

    private fun reconfigure(exo: ExoPlayer) {
        if (exo.mediaItemCount == 0) return
        val index = exo.currentMediaItemIndex
        val position = exo.currentPosition
        val playWhenReady = exo.playWhenReady
        exo.stop()
        exo.prepare()
        exo.seekTo(index, position)
        exo.playWhenReady = playWhenReady
    }

    private fun flush(s: Session) {
        s.started = false
        s.buffered = false
        s.audio.clear()
        s.queuedBytes.set(0)
        s.commands.offer("ACTION=FLUSH")
    }

    private fun startIo(s: Session) {
        // Commands: cliairplay creates the FIFO, then we open it for writing.
        thread("airplay-cmd") {
            var out: OutputStream? = null
            try {
                val deadline = System.currentTimeMillis() + 10_000
                while (!s.cmdPipe.exists() && !s.closed && System.currentTimeMillis() < deadline) Thread.sleep(50)
                out = s.cmdPipe.outputStream()
                while (true) {
                    val cmd = s.commands.poll(500, TimeUnit.MILLISECONDS)
                    if (cmd == null) {
                        if (s.closed && s.commands.isEmpty()) break else continue
                    }
                    out.write("$cmd\n".toByteArray())
                    out.flush()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Command pipe closed: ${e.message}")
            } finally {
                runCatching { out?.close() }
            }
        }
        // Audio: PCM from the tee into stdin.
        thread("airplay-audio") {
            try {
                s.process.outputStream.use { stdin ->
                    while (!s.closed) {
                        val chunk = s.audio.poll(500, TimeUnit.MILLISECONDS) ?: continue
                        s.queuedBytes.addAndGet(-chunk.size)
                        stdin.write(chunk)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Audio stream closed: ${e.message}")
            }
        }
        // Status lines come on both streams.
        thread("airplay-out") { s.process.inputStream.bufferedReader().forEachLine { onStatus(s, it) } }
        thread("airplay-err") {
            s.process.errorStream.bufferedReader().forEachLine { onStatus(s, it) }
            val code = s.process.waitFor()
            mainHandler.post {
                if (session === s) {
                    session = null
                    s.closed = true
                    if (s.idleTimedOut) {
                        // Nothing played for a while: stay on this device and
                        // start a new session as soon as playback resumes.
                        if (playing) spawn(appContext ?: return@post, s.device) else standby = s.device
                    } else {
                        restoreLocalOutput()
                        emit("error", s.device, "AirPlay stopped (exit $code)")
                    }
                }
            }
        }
    }

    private fun onStatus(s: Session, line: String) {
        if (!line.startsWith("[STATUS]") && !line.startsWith("[EVENT]") && !line.startsWith("[ERROR]")) return
        Log.d(TAG, line)
        when {
            line.startsWith("[STATUS] connected") -> mainHandler.post { if (session === s) emit("connected", s.device, null) }
            line.startsWith("[STATUS] audio buffered_ms") -> {
                // The feed (initial, or after a flush) has audio: start it now.
                s.buffered = true
                startIfReady(s)
            }
            line.startsWith("[EVENT] remote command=") ->
                mainHandler.post { if (session === s) onRemoteCommand(line.substringAfter("=").trim()) }
            line.startsWith("[STATUS] idle_timeout") -> s.idleTimedOut = true
            line.startsWith("[STATUS] error") || line.startsWith("[ERROR]") ->
                mainHandler.post { if (session === s) emit("error", s.device, line.substringAfter("] ")) }
        }
    }

    @Synchronized
    private fun startIfReady(s: Session) {
        if (s.started || !s.buffered || !playing) return
        s.started = true
        s.commands.offer("START_UNIX_MS=0")
        s.commands.offer("ACTION=START")
    }

    /** Buttons pressed on the receiver's remote (e.g. the Apple TV remote). */
    private fun onRemoteCommand(command: String) {
        val exo = player ?: return
        when (command) {
            "play" -> exo.play()
            "pause" -> exo.pause()
            "play_pause" -> if (exo.isPlaying) exo.pause() else exo.play()
            "next" -> exo.seekToNext()
            "previous" -> exo.seekToPrevious()
        }
    }

    private fun sendMetadata(s: Session) {
        val exo = player ?: return
        val meta = exo.mediaMetadata
        val lines = listOfNotNull(
            "TITLE=${clean(meta.title)}",
            "ARTIST=${clean(meta.artist)}",
            "ALBUM=${clean(meta.albumTitle)}",
            exo.currentMediaItem?.mediaId?.let { "ITEMID=$it" },
            exo.duration.takeIf { it != C.TIME_UNSET }?.let { "DURATION=${it / 1000}" },
        )
        val artwork = meta.artworkUri?.toString()
        thread("airplay-meta") {
            val file = artwork?.let { downloadArtwork(it, s) }
            lines.forEach { s.commands.offer(it) }
            if (file != null) s.commands.offer("ARTWORKFILE=${file.path}")
            s.commands.offer("ACTION=SENDMETA")
        }
    }

    private fun downloadArtwork(url: String, s: Session): File? = try {
        val file = File(s.cmdPipe.parentFile, "airplay-artwork.jpg")
        URL(url).openStream().use { input -> file.outputStream().use { input.copyTo(it) } }
        file
    } catch (e: Exception) {
        Log.w(TAG, "Artwork download failed: ${e.message}")
        null
    }

    // --- Tee (playback thread) ---

    private fun onSinkFlush(rate: Int, channels: Int, encoding: Int) {
        sinkRate = rate
        sinkChannels = channels
        sinkEncoding = encoding
        val s = session ?: return
        if (s.started) flush(s)
    }

    private fun onPcm(buffer: ByteBuffer) {
        val s = session ?: return
        if (s.closed || sinkRate != SAMPLE_RATE || sinkEncoding != C.ENCODING_PCM_16BIT) return
        val chunk = toStereo(buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN), sinkChannels) ?: return
        s.audio.offer(chunk)
        // Never let a stalled receiver grow the queue without bound.
        if (s.queuedBytes.addAndGet(chunk.size) > MAX_QUEUED_BYTES) {
            s.audio.pollFirst()?.let { s.queuedBytes.addAndGet(-it.size) }
        }
    }

    /** s16le with any channel count → s16le stereo (mono duplicated, extra channels dropped). */
    private fun toStereo(buffer: ByteBuffer, channels: Int): ByteArray? {
        if (channels == 2) return ByteArray(buffer.remaining()).also { buffer.get(it) }
        if (channels < 1) return null
        val frames = buffer.remaining() / (2 * channels)
        val out = ByteBuffer.allocate(frames * 4).order(ByteOrder.LITTLE_ENDIAN)
        repeat(frames) {
            val left = buffer.short
            val right = if (channels > 1) buffer.short else left
            repeat(channels - 2) { buffer.short }
            out.putShort(left).putShort(right)
        }
        return out.array()
    }

    // --- Helpers ---

    private fun emit(state: String, device: Device?, error: String?) {
        listener?.onStateChanged(state, device, error)
    }

    private fun clean(value: CharSequence?) = value?.toString()?.replace('\n', ' ') ?: ""

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Stable per-install identity: Apple TV credentials are bound to it. */
    private fun dacpId(context: Context): String {
        val prefs = prefs(context)
        prefs.getString("dacp", null)?.let { return it }
        val bytes = ByteArray(8).also { SecureRandom().nextBytes(it) }
        val id = bytes.joinToString("") { "%02X".format(it) }
        prefs.edit().putString("dacp", id).apply()
        return id
    }

    private fun thread(name: String, block: () -> Unit) =
        Thread({ runCatching(block).onFailure { Log.w(TAG, "$name: ${it.message}") } }, name).apply { isDaemon = true; start() }
}
