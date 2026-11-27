package cloud.valgrind.vela

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.AudioProcessor.UnhandledAudioFormatException
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.pow
import org.json.JSONObject

/** Loudness leveling never boosts a quiet track by more than this (clipping risk)… */
const val MAX_GAIN_DB = 4.0
/** …nor turns a loud one down by more than this. */
const val MIN_GAIN_DB = -20.0
private const val DB_PER_DECADE = 20.0
private const val MS_PER_SECOND = 1000L

/** Gain at [position] of a linear ramp of [total] steps from [from] to [to]; held at [to] after it. */
fun rampGain(position: Long, total: Long, from: Float, to: Float): Float {
    if (total <= 0 || position >= total) return to
    return from + (to - from) * (position.toFloat() / total)
}

/** Amplitude factor for a server-measured gain; 1 when none is known. */
fun loudnessFactor(gainDb: Double?): Float {
    if (gainDb == null || gainDb.isNaN()) return 1f
    return 10.0.pow(gainDb.coerceIn(MIN_GAIN_DB, MAX_GAIN_DB) / DB_PER_DECADE).toFloat()
}

/** A 16-bit sample times [factor], clamped instead of wrapping around. */
fun scale16(sample: Short, factor: Float): Short =
    (sample * factor).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()

fun scale16(sample: Int, factor: Float): Short = scale16(sample.toShort(), factor)

fun scaleFloat(sample: Float, factor: Float): Float = (sample * factor).coerceIn(-1f, 1f)

/** `gainDb` of a queued track (the app's JSON in the media item extras). */
fun gainDbOf(trackJson: String?): Double? {
    if (trackJson == null) return null
    val json = runCatching { JSONObject(trackJson) }.getOrNull() ?: return null
    return if (json.has("gainDb")) json.optDouble("gainDb").takeUnless { it.isNaN() } else null
}

/**
 * Applies the playing track's loudness leveling gain to the decoded PCM.
 * Sits first in the sink's processor chain, so AirPlay gets levelled sound too.
 */
@UnstableApi
class LoudnessAudioProcessor : BaseAudioProcessor() {
    /** Set from the main thread on each track change, read on the audio thread. */
    @Volatile var factor = 1f

    /** A volume ramp counted in audio frames, so it follows the sound, not the clock. */
    private class Ramp(val from: Float, val to: Float, val durationMs: Long) {
        var position = 0L // frames, audio thread only
    }
    @Volatile private var ramp: Ramp? = null

    /** Fades from [from] to [to] over [durationMs] of audio, starting with the next samples played. */
    fun startRamp(from: Float, to: Float, durationMs: Long) {
        ramp = Ramp(from, to, durationMs)
    }

    fun clearRamp() {
        ramp = null
    }

    // A seek or a track change flushes the sink: the ramp starts with the new samples.
    override fun onFlush() {
        ramp?.position = 0
    }

    private fun frameGain(r: Ramp?, framesTotal: Long): Float {
        if (r == null) return 1f
        return rampGain(r.position++, framesTotal, r.from, r.to)
    }

    override fun onConfigure(inputAudioFormat: AudioFormat): AudioFormat {
        val encoding = inputAudioFormat.encoding
        if (encoding != C.ENCODING_PCM_16BIT && encoding != C.ENCODING_PCM_FLOAT) {
            throw UnhandledAudioFormatException(inputAudioFormat)
        }
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val size = inputBuffer.remaining()
        if (size == 0) return
        val output = replaceOutputBuffer(size)
        val format = inputAudioFormat
        val isFloat = format.encoding == C.ENCODING_PCM_FLOAT
        val r = ramp
        val framesTotal = r?.let { it.durationMs * format.sampleRate / MS_PER_SECOND } ?: 0L
        while (inputBuffer.hasRemaining()) {
            val f = factor * frameGain(r, framesTotal)
            repeat(format.channelCount) {
                if (isFloat) output.putFloat(scaleFloat(inputBuffer.getFloat(), f))
                else output.putShort(scale16(inputBuffer.getShort(), f))
            }
        }
        output.flip()
    }
}
