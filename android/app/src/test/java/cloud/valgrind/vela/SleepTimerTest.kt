package cloud.valgrind.vela

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SleepTimerTest {

    @Test
    fun minutesCountDownToTheDeadline() {
        assertEquals(90_000L, sleepRemainingMs(SleepMode.MINUTES, 100_000, 10_000, 0, 0, false))
    }

    @Test
    fun endOfTrackIsTheRestOfTheTrack() {
        assertEquals(70_000L, sleepRemainingMs(SleepMode.END_OF_TRACK, 0, 0, 30_000, 100_000, false))
    }

    @Test
    fun endOfAlbumWaitsForTheLastTrackOfTheAlbum() {
        assertNull(sleepRemainingMs(SleepMode.END_OF_ALBUM, 0, 0, 30_000, 100_000, false))
        assertEquals(70_000L, sleepRemainingMs(SleepMode.END_OF_ALBUM, 0, 0, 30_000, 100_000, true))
    }

    @Test
    fun unknownDurationIsNotCountedDown() {
        assertNull(sleepRemainingMs(SleepMode.END_OF_TRACK, 0, 0, 30_000, 0, false))
        assertNull(sleepRemainingMs(SleepMode.END_OF_ALBUM, 0, 0, 30_000, -1, true))
    }

    @Test
    fun volumeFadesOverTheLastTenSeconds() {
        assertEquals(0.8f, sleepVolume(0.8f, 60_000), 0.0001f)
        assertEquals(0.4f, sleepVolume(0.8f, 5_000), 0.0001f)
        assertEquals(0f, sleepVolume(0.8f, -1), 0.0001f)
    }

    @Test
    fun lastOfAlbumWhenTheNextTrackIsAnotherAlbumOrNothing() {
        assertTrue(isLastOfAlbum("a", null))
        assertTrue(isLastOfAlbum("a", "b"))
        assertFalse(isLastOfAlbum("a", "a"))
    }

    @Test
    fun parsesTheModeSentByTheApp() {
        assertEquals(SleepMode.END_OF_ALBUM, SleepMode.fromJs("endOfAlbum"))
        assertEquals(SleepMode.MINUTES, SleepMode.fromJs("minutes"))
        assertNull(SleepMode.fromJs("off"))
    }
}
