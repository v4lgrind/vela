package cloud.valgrind.vela

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import org.json.JSONObject

/** Length of a Sweet Fade. */
const val CROSSFADE_MS = 6_000L
/** The outgoing track's tail is loaded this long before the fade starts. */
private const val PREPARE_AHEAD_MS = 8_000L
/** Shorter tracks never fade (a 6 s fade would eat most of them). */
private const val MIN_TRACK_MS = 3 * CROSSFADE_MS
private const val TICK_MS = 100L
/** The tail is released a little after its fade-out ends. */
private const val TAIL_GRACE_MS = 500L
private const val TAG = "Crossfade"

/**
 * Sweet Fades: no fade between a track and the next one of the same album
 * (gapless, as the album intends), a fade everywhere else.
 */
fun shouldCrossfade(currentJson: String?, nextJson: String?): Boolean {
    val current = currentJson?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return true
    val next = nextJson?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return true
    val album = current.optString("albumId")
    val index = current.optInt("indexNumber")
    val sameAlbum = album.isNotEmpty() && album == next.optString("albumId")
    return !(sameAlbum && index > 0 && next.optInt("indexNumber") == index + 1)
}

/** FFmpeg after MediaCodec (ALAC on some devices…), with [processors] at the end of the sink chain. */
@UnstableApi
fun musicRenderersFactory(context: Context, vararg processors: AudioProcessor): DefaultRenderersFactory =
    object : DefaultRenderersFactory(context) {
        override fun buildAudioSink(
            context: Context,
            enableFloatOutput: Boolean,
            enableAudioTrackPlaybackParams: Boolean,
        ): AudioSink = DefaultAudioSink.Builder(context)
            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
            .setAudioProcessorChain(DefaultAudioSink.DefaultAudioProcessorChain(*processors))
            .build()
    }.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

/**
 * Plays the end of the outgoing track on a second, focus-less player while
 * [main] (the session's player) moves on to the next track and fades in.
 */
@UnstableApi
class CrossfadeController(
    private val context: Context,
    private val main: ExoPlayer,
    private val mainLoudness: LoudnessAudioProcessor,
    /** Setting on, no sleep timer, no AirPlay (the tail would play on the phone). */
    private val allowed: () -> Boolean,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var tail: ExoPlayer? = null
    private var tailLoudness: LoudnessAudioProcessor? = null
    /** Main-queue index the tail was loaded for, -1 when none. */
    private var preparedFor = -1
    /** Index whose fade was given up (tail not ready or not seekable). */
    private var skippedFor = -1
    private var fading = false
    private var ourSeek = false

    private val tick = object : Runnable {
        override fun run() {
            check()
            handler.postDelayed(this, TICK_MS)
        }
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (ourSeek) {
                ourSeek = false
                return
            }
            // The user skipped, or the queue moved on by itself: no fade in flight any more.
            reset()
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!playWhenReady) reset()
        }

        override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
            if (!fading) dropTail()
        }
    }

    fun start() {
        main.addListener(listener)
        handler.post(tick)
    }

    fun release() {
        main.removeListener(listener)
        reset()
        handler.removeCallbacksAndMessages(null)
    }

    private fun json(index: Int): String? =
        if (index !in 0 until main.mediaItemCount) null
        else main.getMediaItemAt(index).mediaMetadata.extras?.getString(TRACK_EXTRA)

    private fun eligible(index: Int, durationMs: Long): Boolean {
        val next = main.nextMediaItemIndex
        return allowed() && index != skippedFor && main.repeatMode != Player.REPEAT_MODE_ONE &&
            durationMs >= MIN_TRACK_MS && next != C.INDEX_UNSET && shouldCrossfade(json(index), json(next))
    }

    private fun check() {
        if (fading || !main.isPlaying) return
        val index = main.currentMediaItemIndex
        val duration = main.duration
        if (duration == C.TIME_UNSET || !eligible(index, duration)) {
            dropTail()
            return
        }
        val remaining = duration - main.currentPosition
        if (remaining <= CROSSFADE_MS + PREPARE_AHEAD_MS && preparedFor != index) prepareTail(index, duration)
        if (remaining <= CROSSFADE_MS && preparedFor == index) begin(index)
    }

    private fun prepareTail(index: Int, durationMs: Long) {
        dropTail()
        val loudness = LoudnessAudioProcessor().apply { factor = mainLoudness.factor }
        val player = ExoPlayer.Builder(context, musicRenderersFactory(context, loudness))
            // No audio focus: taking it would pause the main player.
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                false,
            )
            .build()
        player.setMediaItem(main.getMediaItemAt(index), durationMs - CROSSFADE_MS)
        player.playWhenReady = false
        player.prepare()
        tail = player
        tailLoudness = loudness
        preparedFor = index
    }

    private fun begin(index: Int) {
        val player = tail ?: return
        // A live transcode can't seek: the tail would replay the track from its start.
        if (player.playbackState != Player.STATE_READY || !player.isCurrentMediaItemSeekable) {
            Log.i(TAG, "Tail not ready, no fade for this track")
            skippedFor = index
            dropTail()
            return
        }
        fading = true
        tailLoudness?.startRamp(1f, 0f, CROSSFADE_MS)
        player.volume = main.volume
        player.play()
        mainLoudness.startRamp(0f, 1f, CROSSFADE_MS)
        ourSeek = true
        main.seekToNextMediaItem()
        handler.postDelayed({ finish() }, CROSSFADE_MS + TAIL_GRACE_MS)
    }

    private fun finish() {
        fading = false
        dropTail()
        mainLoudness.clearRamp()
    }

    /** Stops any fade in flight: main back to full volume, tail gone. */
    private fun reset() {
        if (fading) mainLoudness.clearRamp()
        fading = false
        handler.removeCallbacksAndMessages(null)
        handler.post(tick)
        dropTail()
    }

    private fun dropTail() {
        tail?.release()
        tail = null
        tailLoudness = null
        preparedFor = -1
    }
}
