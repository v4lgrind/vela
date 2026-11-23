package cloud.valgrind.vela

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Seek-bar preview thumbnails from Jellyfin trickplay: each sheet is a JPEG
 * grid of [Info.tileWidth] x [Info.tileHeight] thumbnails, one every
 * [Info.intervalMs]. Sheets are downloaded on demand and the requested tile
 * is cut out with a region decoder, so a full sheet is never decoded.
 */
class TrickplayThumbnails(private val info: Info, private val headers: Map<String, String>) : SeekPreviews {

    data class Info(
        /** Sheet URL with `{index}` in place of the sheet number. */
        val urlTemplate: String,
        val width: Int,
        val height: Int,
        val tileWidth: Int,
        val tileHeight: Int,
        val thumbnailCount: Int,
        val intervalMs: Long,
    )

    companion object {
        private const val TAG = "Trickplay"

        fun parse(json: String?): Info? {
            if (json.isNullOrEmpty()) return null
            return try {
                val o = JSONObject(json)
                Info(
                    o.getString("urlTemplate"),
                    o.getInt("width"),
                    o.getInt("height"),
                    o.getInt("tileWidth"),
                    o.getInt("tileHeight"),
                    o.getInt("thumbnailCount"),
                    o.getLong("intervalMs"),
                ).takeIf { it.width > 0 && it.height > 0 && it.tileWidth > 0 && it.tileHeight > 0 && it.intervalMs > 0 }
            } catch (e: Exception) {
                Log.w(TAG, "Bad trickplay info: ${e.message}")
                null
            }
        }
    }

    override val aspectRatio: Float get() = info.height.toFloat() / info.width

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val sheets = object : LruCache<Int, BitmapRegionDecoder>(4) {
        override fun entryRemoved(evicted: Boolean, key: Int, old: BitmapRegionDecoder, new: BitmapRegionDecoder?) {
            synchronized(old) { old.recycle() }
        }
    }

    /** Only the latest request is decoded; older ones are skipped while dragging fast. */
    @Volatile private var wanted = -1

    /** Main thread. [onReady] runs on the main thread with the thumbnail at [positionMs]. */
    override fun load(positionMs: Long, onReady: (Bitmap) -> Unit) {
        val index = (positionMs / info.intervalMs).toInt().coerceIn(0, info.thumbnailCount - 1)
        if (index == wanted) return
        wanted = index
        executor.execute {
            if (wanted != index) return@execute
            val bitmap = decode(index) ?: return@execute
            mainHandler.post { if (wanted == index) onReady(bitmap) }
        }
    }

    /** Drops the pending request, e.g. when the preview is hidden. */
    override fun cancel() {
        wanted = -1
    }

    override fun release() {
        cancel()
        executor.shutdownNow()
        sheets.evictAll()
    }

    private fun decode(index: Int): Bitmap? {
        val perSheet = info.tileWidth * info.tileHeight
        val sheet = index / perSheet
        val local = index % perSheet
        val decoder = sheets.get(sheet) ?: fetchSheet(sheet)?.also { sheets.put(sheet, it) } ?: return null
        val x = (local % info.tileWidth) * info.width
        val y = (local / info.tileWidth) * info.height
        val rect = Rect(x, y, x + info.width, y + info.height)
        if (rect.right > decoder.width || rect.bottom > decoder.height) return null
        return synchronized(decoder) {
            // Recycled when evicted or released meanwhile.
            if (decoder.isRecycled) null
            else decoder.decodeRegion(rect, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 })
        }
    }

    @Suppress("DEPRECATION")
    private fun fetchSheet(sheet: Int): BitmapRegionDecoder? = try {
        val conn = URL(info.urlTemplate.replace("{index}", sheet.toString())).openConnection() as HttpURLConnection
        headers.forEach { (name, value) -> conn.setRequestProperty(name, value) }
        conn.connectTimeout = 5000
        conn.readTimeout = 10000
        try {
            val bytes = conn.inputStream.use { it.readBytes() }
            BitmapRegionDecoder.newInstance(bytes, 0, bytes.size, false)
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "Sheet $sheet failed: ${e.message}")
        null
    }
}
