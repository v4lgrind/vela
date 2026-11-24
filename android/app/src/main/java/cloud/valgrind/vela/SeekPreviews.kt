package cloud.valgrind.vela

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Seek-bar preview thumbnails, whatever the server's format. */
interface SeekPreviews {
    /** Height / width of a thumbnail. */
    val aspectRatio: Float
    /** Main thread. [onReady] runs on the main thread with the thumbnail at [positionMs]. */
    fun load(positionMs: Long, onReady: (Bitmap) -> Unit)
    fun cancel()
    fun release()

    companion object {
        /** `{format: "bif", url}` (Plex) or the tile-sheet info (Jellyfin); null when there are none. */
        fun from(json: String?, headers: Map<String, String>): SeekPreviews? {
            if (json.isNullOrEmpty()) return null
            val format = try { JSONObject(json).optString("format") } catch (e: Exception) { "" }
            if (format == "bif") return JSONObject(json).optString("url").takeIf { it.isNotEmpty() }?.let { BifThumbnails(it, headers) }
            return TrickplayThumbnails.parse(json)?.let { TrickplayThumbnails(it, headers) }
        }
    }
}

/** One BIF file holding every thumbnail: downloaded once on first use, frames decoded on demand. */
class BifThumbnails(private val url: String, private val headers: Map<String, String>) : SeekPreviews {
    companion object {
        private const val TAG = "BifThumbnails"
        /** Plex generates 16:9 "sd" previews. */
        private const val DEFAULT_ASPECT = 9f / 16f
    }

    override var aspectRatio: Float = DEFAULT_ASPECT
        private set

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var index: BifIndex? = null
    @Volatile private var failed = false
    /** Only the latest request is decoded; older ones are skipped while dragging fast. */
    @Volatile private var wanted = -1L

    override fun load(positionMs: Long, onReady: (Bitmap) -> Unit) {
        wanted = positionMs
        executor.execute {
            if (wanted != positionMs || failed) return@execute
            val bif = index ?: fetch()?.also { index = it } ?: run { failed = true; return@execute }
            val bytes = bif.frameAt(positionMs) ?: return@execute
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@execute
            aspectRatio = bitmap.height.toFloat() / bitmap.width
            mainHandler.post { if (wanted == positionMs) onReady(bitmap) }
        }
    }

    override fun cancel() {
        wanted = -1L
    }

    override fun release() {
        cancel()
        executor.shutdownNow()
        index = null
    }

    private fun fetch(): BifIndex? = try {
        val conn = URL(url).openConnection() as HttpURLConnection
        headers.forEach { (name, value) -> conn.setRequestProperty(name, value) }
        conn.connectTimeout = 5000
        conn.readTimeout = 20000
        try {
            BifIndex.parse(conn.inputStream.use { it.readBytes() })
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "BIF failed: ${e.message}")
        null
    }
}
