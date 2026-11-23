package cloud.valgrind.vela

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class BifIndexTest {

    /** BIF with [frames] (one byte array each), one every [intervalMs]. */
    private fun bif(frames: List<ByteArray>, intervalMs: Int, magic: ByteArray = BifIndex.MAGIC): ByteArray {
        val header = 64 + (frames.size + 1) * 8
        val buffer = ByteBuffer.allocate(header + frames.sumOf { it.size }).order(ByteOrder.LITTLE_ENDIAN)
        buffer.put(magic)
        buffer.putInt(8, 0)
        buffer.putInt(12, frames.size)
        buffer.putInt(16, intervalMs)
        var offset = header
        frames.forEachIndexed { i, frame ->
            buffer.putInt(64 + i * 8, i)
            buffer.putInt(64 + i * 8 + 4, offset)
            offset += frame.size
        }
        buffer.putInt(64 + frames.size * 8, -1)
        buffer.putInt(64 + frames.size * 8 + 4, offset)
        var at = header
        frames.forEach { frame -> frame.forEachIndexed { k, b -> buffer.put(at + k, b) }; at += frame.size }
        return buffer.array()
    }

    private val frames = listOf(byteArrayOf(1, 1), byteArrayOf(2, 2, 2), byteArrayOf(3))

    @Test fun readsTheFrameShownAtAPosition() {
        val index = BifIndex.parse(bif(frames, 10_000))!!
        assertEquals(3, index.count)
        assertEquals(10_000L, index.intervalMs)
        assertArrayEquals(byteArrayOf(1, 1), index.frameAt(0))
        assertArrayEquals(byteArrayOf(1, 1), index.frameAt(9_999))
        assertArrayEquals(byteArrayOf(2, 2, 2), index.frameAt(10_000))
        assertArrayEquals(byteArrayOf(3), index.frameAt(25_000))
    }

    @Test fun keepsTheLastFrameAfterTheEnd() {
        assertArrayEquals(byteArrayOf(3), BifIndex.parse(bif(frames, 10_000))!!.frameAt(999_000))
    }

    @Test fun defaultsToOneSecondWhenTheIntervalIsZero() {
        assertEquals(1_000L, BifIndex.parse(bif(frames, 0))!!.intervalMs)
    }

    @Test fun rejectsAnythingElse() {
        assertNull(BifIndex.parse("<html>404</html>".toByteArray()))
        assertNull(BifIndex.parse(bif(frames, 10_000, magic = ByteArray(8))))
    }
}
