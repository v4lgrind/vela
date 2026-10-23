package cloud.valgrind.vela

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

private const val TAG = "NativeAudio"
// MediaMetadata extra holding the app's AudioTrack JSON (also set by JellyfinLibrary).
internal const val TRACK_EXTRA = "track"
private const val TICK_MS = 1000L

/**
 * JS bridge to [MusicService]. Commands go to the service's player through a
 * MediaController; player state comes back as `stateChange` events (on every
 * player event, plus once a second while playing for the position).
 */
@CapacitorPlugin(name = "NativeAudio")
class NativeAudioPlugin : Plugin() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private var connecting = false
    private val pending = mutableListOf<(MediaController) -> Unit>()

    private val ticker = object : Runnable {
        override fun run() {
            controller?.let { emitState(it) }
            mainHandler.postDelayed(this, TICK_MS)
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            controller?.let { emitState(it) }
            mainHandler.removeCallbacks(ticker)
            if (player.isPlaying) mainHandler.postDelayed(ticker, TICK_MS)
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.e(TAG, "Playback error", error)
            notifyListeners("error", JSObject()
                .put("message", error.message ?: error.errorCodeName)
                .put("code", error.errorCodeName))
        }
    }

    override fun handleOnDestroy() {
        mainHandler.removeCallbacks(ticker)
        controller?.release()
        controller = null
    }

    // Runs on the main thread; the controller must only be touched there.
    private fun connect() {
        if (connecting) return
        connecting = true
        val token = SessionToken(context, ComponentName(context, MusicService::class.java))
        val future = MediaController.Builder(context, token)
            .setListener(object : MediaController.Listener {
                override fun onDisconnected(controller: MediaController) {
                    this@NativeAudioPlugin.controller = null
                    mainHandler.removeCallbacks(ticker)
                }

                // A queue started in the car: the WebView re-reads it with getState.
                override fun onCustomCommand(
                    controller: MediaController,
                    command: SessionCommand,
                    args: Bundle,
                ): ListenableFuture<SessionResult> {
                    if (command.customAction == MusicService.COMMAND_EXTERNAL_QUEUE) notifyListeners("externalQueue", JSObject())
                    return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
                }
            })
            .buildAsync()
        future.addListener({
            connecting = false
            val c = try {
                future.get()
            } catch (e: Exception) {
                Log.e(TAG, "MediaController connection failed", e)
                return@addListener
            }
            controller = c
            c.addListener(playerListener)
            if (c.isPlaying) mainHandler.postDelayed(ticker, TICK_MS)
            pending.toList().forEach { it(c) }
            pending.clear()
        }, ContextCompat.getMainExecutor(context))
    }

    private fun withController(call: PluginCall, block: (MediaController) -> Unit) {
        mainHandler.post {
            val run = { c: MediaController ->
                try {
                    block(c)
                } catch (e: Exception) {
                    Log.e(TAG, "Command failed", e)
                    call.reject(e.message ?: "Command failed")
                }
            }
            val c = controller
            if (c != null) {
                run(c)
            } else {
                pending.add(run)
                connect()
            }
        }
    }

    @PluginMethod
    fun setQueue(call: PluginCall) {
        val items = toMediaItems(call.getArray("tracks") ?: JSArray())
        val startIndex = call.getInt("startIndex") ?: 0
        val startPositionMs = call.data.optLong("startPositionMs", 0L)
        val playWhenReady = call.getBoolean("playWhenReady") ?: true
        withController(call) { c ->
            c.setMediaItems(items, startIndex, startPositionMs)
            c.prepare()
            c.playWhenReady = playWhenReady
            call.resolve()
        }
    }

    @PluginMethod
    fun play(call: PluginCall) = withController(call) { c ->
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
        c.play()
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) = withController(call) { c ->
        c.pause()
        call.resolve()
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        val positionMs = call.data.optLong("positionMs", 0L)
        withController(call) { c ->
            c.seekTo(positionMs)
            call.resolve()
        }
    }

    @PluginMethod
    fun skipTo(call: PluginCall) {
        val index = call.getInt("index") ?: 0
        withController(call) { c ->
            c.seekTo(index, 0L)
            if (c.playbackState == Player.STATE_IDLE) c.prepare()
            c.play()
            call.resolve()
        }
    }

    @PluginMethod
    fun next(call: PluginCall) = withController(call) { c ->
        c.seekToNextMediaItem()
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
        call.resolve()
    }

    /** Restarts the track past 3 s, otherwise goes to the previous one. */
    @PluginMethod
    fun previous(call: PluginCall) = withController(call) { c ->
        c.seekToPrevious()
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
        call.resolve()
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        val volume = call.data.optDouble("volume", 1.0).toFloat().coerceIn(0f, 1f)
        withController(call) { c ->
            // While on AirPlay the local output stays muted; the slider drives the receiver.
            if (AirPlayManager.currentDevice() != null) AirPlayManager.setVolume((volume * 100).toInt())
            else c.volume = volume
            call.resolve()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) = withController(call) { c ->
        c.stop()
        c.clearMediaItems()
        call.resolve()
    }

    @PluginMethod
    fun addTracks(call: PluginCall) {
        val items = toMediaItems(call.getArray("tracks") ?: JSArray())
        val index = call.getInt("index") ?: Int.MAX_VALUE
        withController(call) { c ->
            c.addMediaItems(index.coerceAtMost(c.mediaItemCount), items)
            call.resolve()
        }
    }

    @PluginMethod
    fun removeTrack(call: PluginCall) {
        val index = call.getInt("index") ?: -1
        withController(call) { c ->
            if (index in 0 until c.mediaItemCount) c.removeMediaItem(index)
            call.resolve()
        }
    }

    @PluginMethod
    fun moveTrack(call: PluginCall) {
        val from = call.getInt("from") ?: 0
        val to = call.getInt("to") ?: 0
        withController(call) { c ->
            c.moveMediaItem(from, to)
            call.resolve()
        }
    }

    /** Replaces everything around the current track without interrupting it. */
    @PluginMethod
    fun replaceAroundCurrent(call: PluginCall) {
        val before = toMediaItems(call.getArray("before") ?: JSArray())
        val after = toMediaItems(call.getArray("after") ?: JSArray())
        withController(call) { c ->
            val current = c.currentMediaItemIndex
            if (current + 1 < c.mediaItemCount) c.removeMediaItems(current + 1, c.mediaItemCount)
            if (current > 0) c.removeMediaItems(0, current)
            c.addMediaItems(0, before)
            c.addMediaItems(after)
            call.resolve()
        }
    }

    @PluginMethod
    fun setRepeatMode(call: PluginCall) {
        val mode = when (call.getString("mode")) {
            "all" -> Player.REPEAT_MODE_ALL
            "one" -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
        withController(call) { c ->
            c.repeatMode = mode
            call.resolve()
        }
    }

    /** Current state plus the queue, so a recreated WebView can resync. */
    /** Server and credentials for browsing the library from Android Auto. */
    @PluginMethod
    fun setLibraryConfig(call: PluginCall) {
        JellyfinLibrary.saveConfig(
            context,
            call.getString("serverUrl") ?: "",
            call.getString("accessToken") ?: "",
            call.getString("userId") ?: "",
            call.data.optLong("maxBitrate", 140_000_000L),
        )
        call.resolve()
    }

    @PluginMethod
    fun getState(call: PluginCall) = withController(call) { c ->
        val tracks = JSArray()
        for (i in 0 until c.mediaItemCount) {
            val json = c.getMediaItemAt(i).mediaMetadata.extras?.getString(TRACK_EXTRA)
            tracks.put(if (json != null) JSONObject(json) else JSONObject())
        }
        call.resolve(stateOf(c).put("tracks", tracks))
    }

    private fun emitState(c: MediaController) {
        notifyListeners("stateChange", stateOf(c))
    }

    private fun stateOf(c: MediaController): JSObject {
        val duration = c.duration
        return JSObject()
            .put("index", c.currentMediaItemIndex)
            .put("trackId", c.currentMediaItem?.mediaId ?: "")
            .put("isPlaying", c.playWhenReady && c.playbackState != Player.STATE_ENDED)
            .put("ended", c.playbackState == Player.STATE_ENDED)
            .put("positionMs", c.currentPosition)
            .put("durationMs", if (duration == C.TIME_UNSET) 0L else duration)
    }

    private fun toMediaItems(tracks: JSArray): List<MediaItem> =
        (0 until tracks.length()).map { toMediaItem(tracks.getJSONObject(it)) }

    private fun toMediaItem(t: JSONObject): MediaItem {
        val uri = Uri.parse(t.getString("url"))
        val artwork = t.optString("artworkUrl").takeIf { it.isNotEmpty() }?.let(Uri::parse)
        val extras = Bundle().apply {
            t.optJSONObject("track")?.let { putString(TRACK_EXTRA, it.toString()) }
        }
        val metadata = MediaMetadata.Builder()
            .setTitle(t.optString("title"))
            .setArtist(t.optString("artist"))
            .setAlbumTitle(t.optString("album"))
            .setArtworkUri(artwork)
            .setExtras(extras)
            .build()
        return MediaItem.Builder()
            .setMediaId(t.getString("id"))
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(metadata)
            .build()
    }
}
