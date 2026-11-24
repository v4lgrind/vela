package cloud.valgrind.vela

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * A BIF file (Roku format, served by Plex for seek-bar previews): magic, image
 * count at 12, interval in ms at 16 (0 = 1 s), then from byte 64 an index of
 * `[frame number, offset]` pairs ended by `[0xffffffff, end offset]`, then the
 * JPEG frames back to back. Pure Kotlin so it can be unit-tested.
 */
class BifIndex private constructor(
    private val bytes: ByteArray,
    private val frameNumbers: IntArray,
    private val offsets: IntArray,
    val intervalMs: Long,
) {
    val count: Int get() = frameNumbers.size

    /** JPEG bytes of the frame shown at [positionMs]; the last one after the end. */
    fun frameAt(positionMs: Long): ByteArray? {
        if (count == 0) return null
        val wanted = (positionMs / intervalMs).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        var low = 0
        var high = count - 1
        while (low < high) {
            val mid = (low + high + 1) / 2
            if (frameNumbers[mid] <= wanted) low = mid else high = mid - 1
        }
        val start = offsets[low]
        val end = offsets[low + 1]
        if (start < 0 || end > bytes.size || end <= start) return null
        return bytes.copyOfRange(start, end)
    }

    companion object {
        val MAGIC = byteArrayOf(0x89.toByte(), 0x42, 0x49, 0x46, 0x0d, 0x0a, 0x1a, 0x0a)
        private const val INDEX_START = 64

        fun parse(bytes: ByteArray): BifIndex? {
            if (bytes.size < INDEX_START || !bytes.copyOfRange(0, 8).contentEquals(MAGIC)) return null
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val count = buffer.getInt(12)
            if (count < 0 || INDEX_START + (count + 1) * 8 > bytes.size) return null
            val interval = buffer.getInt(16).toLong().takeIf { it > 0 } ?: 1_000L
            val frames = IntArray(count) { buffer.getInt(INDEX_START + it * 8) }
            // count + 1 offsets: the terminator's offset is where the last frame ends.
            val offsets = IntArray(count + 1) { buffer.getInt(INDEX_START + it * 8 + 4) }
            return BifIndex(bytes, frames, offsets, interval)
        }
    }
}
