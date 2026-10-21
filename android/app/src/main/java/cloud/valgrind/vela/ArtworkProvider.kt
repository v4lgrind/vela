package cloud.valgrind.vela

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.File
import java.io.FileNotFoundException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Serves Jellyfin cover art as `content://` URIs: Android Auto only loads
 * browse artwork from content URIs, never from http. Images are downloaded
 * with the stored token and cached on disk; only item ids are accepted, so
 * the provider can't be used to fetch anything else.
 */
class ArtworkProvider : ContentProvider() {

    companion object {
        private const val TAG = "ArtworkProvider"
        private val ITEM_ID = Regex("^[0-9a-f]{32}$")

        fun uri(context: Context, itemId: String): Uri =
            Uri.parse("content://${context.packageName}.artwork/$itemId")
    }

    override fun onCreate() = true

    override fun getType(uri: Uri) = "image/jpeg"

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val ctx = context ?: throw FileNotFoundException(uri.toString())
        val itemId = uri.lastPathSegment?.takeIf { ITEM_ID.matches(it) } ?: throw FileNotFoundException(uri.toString())
        val file = File(File(ctx.cacheDir, "artwork").apply { mkdirs() }, "$itemId.jpg")
        if (!file.exists()) download(ctx, itemId, file)
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    private fun download(ctx: Context, itemId: String, file: File) {
        val (url, auth) = JellyfinLibrary(ctx).imageRequest(itemId) ?: throw FileNotFoundException(itemId)
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.setRequestProperty("Authorization", auth)
        conn.connectTimeout = 8000
        conn.readTimeout = 15000
        try {
            if (conn.responseCode != 200) throw FileNotFoundException("HTTP ${conn.responseCode} for $itemId")
            val tmp = File(file.parentFile, "$itemId.tmp")
            conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            tmp.renameTo(file)
        } catch (e: FileNotFoundException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Artwork $itemId failed: ${e.message}")
            throw FileNotFoundException(itemId)
        } finally {
            conn.disconnect()
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
