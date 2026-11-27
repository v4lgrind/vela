package cloud.valgrind.vela

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrossfadeTest {

    private fun track(albumId: String, index: Int) = """{"id":"t","albumId":"$albumId","indexNumber":$index}"""

    @Test
    fun fadesBetweenTracksOfDifferentAlbums() {
        assertTrue(shouldCrossfade(track("a", 3), track("b", 1)))
    }

    @Test
    fun keepsTheNextTrackOfTheSameAlbumGapless() {
        assertFalse(shouldCrossfade(track("a", 3), track("a", 4)))
    }

    @Test
    fun fadesBetweenNonConsecutiveTracksOfTheSameAlbum() {
        assertTrue(shouldCrossfade(track("a", 3), track("a", 7)))
        assertTrue(shouldCrossfade(track("a", 3), track("a", 2)))
    }

    @Test
    fun fadesWhenTheQueueSaysNothingUsable() {
        assertTrue(shouldCrossfade(null, track("a", 1)))
        assertTrue(shouldCrossfade(track("a", 0), track("a", 1).replace("\"indexNumber\":1", "\"indexNumber\":0")))
    }

    @Test
    fun rampsLinearlyAndHoldsTheEnds() {
        assertEquals(0f, rampGain(0, 100, 0f, 1f), 0.0001f)
        assertEquals(0.5f, rampGain(50, 100, 0f, 1f), 0.0001f)
        assertEquals(1f, rampGain(150, 100, 0f, 1f), 0.0001f)
        assertEquals(0.75f, rampGain(25, 100, 1f, 0f), 0.0001f)
        assertEquals(0f, rampGain(100, 100, 1f, 0f), 0.0001f)
    }

    @Test
    fun anEmptyRampIsAlreadyAtItsTarget() {
        assertEquals(1f, rampGain(0, 0, 0f, 1f), 0.0001f)
    }
}
