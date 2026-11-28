package cloud.valgrind.vela

/** When the sleep timer pauses the music (see MusicService). */
enum class SleepMode {
    MINUTES, END_OF_TRACK, END_OF_ALBUM;

    companion object {
        /** The app's mode name; null for "off" or anything unknown. */
        fun fromJs(mode: String?): SleepMode? = when (mode) {
            "minutes" -> MINUTES
            "endOfTrack" -> END_OF_TRACK
            "endOfAlbum" -> END_OF_ALBUM
            else -> null
        }
    }
}

/** The volume goes down to silence over this last stretch before the pause. */
const val SLEEP_FADE_MS = 10_000L

/**
 * Milliseconds before the pause, or null while the timer does not target the
 * playing track yet (end of album, not its last track) or its duration is unknown.
 */
fun sleepRemainingMs(
    mode: SleepMode,
    deadlineMs: Long,
    nowMs: Long,
    positionMs: Long,
    durationMs: Long,
    lastOfAlbum: Boolean,
): Long? = when {
    mode == SleepMode.MINUTES -> deadlineMs - nowMs
    mode == SleepMode.END_OF_ALBUM && !lastOfAlbum -> null
    durationMs <= 0 -> null
    else -> durationMs - positionMs
}

/** Player volume while fading out: [baseVolume] until the last [SLEEP_FADE_MS], then down to 0. */
fun sleepVolume(baseVolume: Float, remainingMs: Long): Float =
    baseVolume * (remainingMs.toFloat() / SLEEP_FADE_MS).coerceIn(0f, 1f)

/** The playing track ends its album when the next one is from another album, or there is none. */
fun isLastOfAlbum(currentAlbumId: String?, nextAlbumId: String?): Boolean =
    nextAlbumId == null || nextAlbumId != currentAlbumId
