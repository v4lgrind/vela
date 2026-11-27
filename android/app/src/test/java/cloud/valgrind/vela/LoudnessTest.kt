package cloud.valgrind.vela

import org.junit.Assert.assertEquals
import org.junit.Test

class LoudnessTest {

    @Test
    fun noGainKnownLeavesTheTrackAsIs() {
        assertEquals(1f, loudnessFactor(null), 0.0001f)
        assertEquals(1f, loudnessFactor(Double.NaN), 0.0001f)
    }

    @Test
    fun appliesTheMeasuredGain() {
        assertEquals(0.5012f, loudnessFactor(-6.0), 0.0001f)
        assertEquals(1.4125f, loudnessFactor(3.0), 0.0001f)
    }

    @Test
    fun boundsTheGain() {
        assertEquals(loudnessFactor(MAX_GAIN_DB), loudnessFactor(15.0), 0.0001f)
        assertEquals(loudnessFactor(MIN_GAIN_DB), loudnessFactor(-60.0), 0.0001f)
    }

    @Test
    fun scales16BitSamplesWithoutWrappingAround() {
        assertEquals(500.toShort(), scale16(1000, 0.5f))
        assertEquals(Short.MAX_VALUE, scale16(30_000, 2f))
        assertEquals(Short.MIN_VALUE, scale16(-30_000, 2f))
    }

    @Test
    fun scalesFloatSamplesWithinRange() {
        assertEquals(0.25f, scaleFloat(0.5f, 0.5f), 0.0001f)
        assertEquals(1f, scaleFloat(0.8f, 2f), 0.0001f)
        assertEquals(-1f, scaleFloat(-0.8f, 2f), 0.0001f)
    }

    @Test
    fun readsTheGainOfAQueuedTrack() {
        assertEquals(-7.5, gainDbOf("""{"id":"t1","gainDb":-7.5}""")!!, 0.0001)
        assertEquals(null, gainDbOf("""{"id":"t1"}"""))
        assertEquals(null, gainDbOf(null))
        assertEquals(null, gainDbOf("not json"))
    }
}
