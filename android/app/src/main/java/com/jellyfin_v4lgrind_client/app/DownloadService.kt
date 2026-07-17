package com.jellyfin_v4lgrind_client.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.PowerManager
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONObject
import org.json.JSONArray
import java.io.BufferedOutputStream
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.LinkedBlockingDeque

class DownloadService : Service() {

    companion object {
        const val ACTION_ENQUEUE  = "com.jellyfin_v4lgrind_client.app.DOWNLOAD_ENQUEUE"
        const val ACTION_CANCEL   = "com.jellyfin_v4lgrind_client.app.DOWNLOAD_CANCEL"
        const val ACTION_PROGRESS = "com.jellyfin_v4lgrind_client.app.DL_PROGRESS"
        const val ACTION_COMPLETE = "com.jellyfin_v4lgrind_client.app.DL_COMPLETE"
        const val ACTION_FAILED   = "com.jellyfin_v4lgrind_client.app.DL_FAILED"

        private const val CHANNEL_ID = "dl_channel"
        private const val NOTIF_ID   = 3001
        private const val PREFS_NAME     = "dl_prefs"
        private const val PREFS_KEY      = "dl_queue"
        private const val PREFS_KEY_DONE = "dl_done"
        private const val MAX_RETRIES = 3
    }

    private data class Task(
        val itemId: String,
        val url: String,
        val headers: Map<String, String>,
        val destPath: String,
        val itemName: String,
        val estimatedSize: Long,
    )

    private data class DownloadDestination(
        val uri: Uri,
        val output: OutputStream,
        val legacyFile: File? = null,
    )

    private val queue = LinkedBlockingDeque<Task>()
    private val cancelledIds: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())

    @Volatile private var workerRunning = false
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var lbm: LocalBroadcastManager

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        lbm = LocalBroadcastManager.getInstance(this)
        createChannel()
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DownloadService::wakelock")
        restoreQueue()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_ENQUEUE -> {
                val task = intent.toTask() ?: return START_STICKY
                if (queue.none { it.itemId == task.itemId } && task.itemId !in cancelledIds) {
                    queue.addLast(task)
                    persistQueue()
                }
                ServiceCompat.startForeground(
                    this, NOTIF_ID, buildNotif("Preparing download…", "", 0L, -1L),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
                ensureWorkerRunning()
            }
            ACTION_CANCEL -> {
                val itemId = intent.getStringExtra("itemId") ?: return START_STICKY
                cancelledIds.add(itemId)
                queue.removeIf { it.itemId == itemId }
                persistQueue()
            }
        }
        return START_STICKY
    }

    // ── Worker ───────────────────────────────────────────────────────────────────

    private fun ensureWorkerRunning() {
        synchronized(this) {
            if (workerRunning) return
            workerRunning = true
        }
        Thread {
            wakeLock?.acquire(6 * 60 * 60 * 1000L) // 6-hour safety cap
            try {
                while (true) {
                    val task = queue.pollFirst() ?: break
                    if (task.itemId in cancelledIds) {
                        cancelledIds.remove(task.itemId)
                        persistQueue()
                        continue
                    }
                    persistQueue()
                    doDownloadWithRetry(task, 0)
                }
            } finally {
                if (wakeLock?.isHeld == true) wakeLock?.release()
                synchronized(this) { workerRunning = false }
                // Restart if new tasks arrived while the last poll returned empty
                if (queue.isNotEmpty()) {
                    ensureWorkerRunning()
                } else {
                    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }.also { it.isDaemon = true; it.start() }
    }

    // ── Download logic ───────────────────────────────────────────────────────────

    private fun doDownloadWithRetry(task: Task, attempt: Int) {
        if (task.itemId in cancelledIds) return
        try {
            doDownload(task)
        } catch (e: InterruptedException) {
            android.util.Log.d("DownloadService", "Download cancelled: ${task.itemId}")
            lbm.sendBroadcast(Intent(ACTION_FAILED).apply {
                putExtra("itemId", task.itemId)
                putExtra("error", "AbortError")
            })
        } catch (e: Exception) {
            android.util.Log.e("DownloadService", "Download error attempt $attempt: ${e.message}")
            if (attempt < MAX_RETRIES - 1 && task.itemId !in cancelledIds) {
                try { Thread.sleep(5000L * (attempt + 1)) } catch (_: InterruptedException) { return }
                doDownloadWithRetry(task, attempt + 1)
            } else {
                lbm.sendBroadcast(Intent(ACTION_FAILED).apply {
                    putExtra("itemId", task.itemId)
                    putExtra("error", e.message ?: "Download failed after $MAX_RETRIES attempts")
                })
            }
        }
    }

    private fun doDownload(task: Task) {
        if (task.itemId in cancelledIds) throw InterruptedException()

        val conn = (URL(task.url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 30_000
            readTimeout    = 60_000
            task.headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }

        val responseCode = conn.responseCode
        if (responseCode != 200 && responseCode != 206) {
            conn.disconnect()
            throw java.io.IOException("HTTP $responseCode for ${task.url.substringBefore('?')}")
        }

        val contentLength = conn.contentLengthLong
        val totalSize = if (contentLength > 0) contentLength else task.estimatedSize

        var downloaded = 0L
        var lastBroadcast = 0L
        val destination = createDownloadDestination(task.destPath)

        try {
            conn.inputStream.buffered(65_536).use { input ->
                BufferedOutputStream(destination.output, 65_536).use { output ->
                    val buf = ByteArray(65_536)
                    while (true) {
                        if (task.itemId in cancelledIds) throw InterruptedException()
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        downloaded += n
                        val now = System.currentTimeMillis()
                        if (now - lastBroadcast >= 500) {
                            lastBroadcast = now
                            broadcastProgress(task.itemId, downloaded, totalSize)
                            updateNotif(task.itemName, task.itemId, downloaded, totalSize)
                        }
                    }
                }
            }
            if (task.itemId in cancelledIds) throw InterruptedException()
            publishDownload(destination)
        } catch (error: Exception) {
            discardDownload(destination)
            throw error
        } finally {
            conn.disconnect()
        }

        val fileSize = downloaded
        val publicPath = destination.uri.toString()
        lbm.sendBroadcast(Intent(ACTION_COMPLETE).apply {
            putExtra("itemId", task.itemId)
            putExtra("filePath", publicPath)
            putExtra("fileSize", fileSize)
        })
        if (!task.itemId.startsWith("subtitle-")) {
            savePendingComplete(task.itemId, publicPath, fileSize)
        }
        android.util.Log.d("DownloadService", "Complete: ${task.itemName} ($fileSize bytes)")
    }

    private fun createDownloadDestination(destPath: String): DownloadDestination {
        val safePath = sanitizeDestinationPath(destPath)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val root = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
            val file = File(root, safePath)
            file.parentFile?.mkdirs()
            return DownloadDestination(Uri.fromFile(file), file.outputStream(), file)
        }

        val displayName = safePath.substringAfterLast('/')
        val parentPath = safePath.substringBeforeLast('/', "")
        val relativePath = listOf(Environment.DIRECTORY_DOCUMENTS, parentPath)
            .filter { it.isNotBlank() }
            .joinToString("/")
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, getMimeType(displayName))
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$relativePath/")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = contentResolver.insert(collection, values)
            ?: throw java.io.IOException("Unable to create public download")
        val output = contentResolver.openOutputStream(uri, "w")
            ?: run {
                contentResolver.delete(uri, null, null)
                throw java.io.IOException("Unable to open public download")
            }
        return DownloadDestination(uri, output)
    }

    private fun sanitizeDestinationPath(destPath: String): String {
        val parts = destPath.replace('\\', '/').split('/').filter { it.isNotBlank() }
        if (parts.isEmpty() || parts.any { it == "." || it == ".." }) {
            throw java.io.IOException("Invalid download destination")
        }
        return parts.joinToString("/")
    }

    private fun getMimeType(filename: String): String {
        val extension = filename.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
            ?: "application/octet-stream"
    }

    private fun publishDownload(destination: DownloadDestination) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            contentResolver.update(destination.uri, values, null, null)
            return
        }
        destination.legacyFile?.let { file ->
            MediaScannerConnection.scanFile(this, arrayOf(file.absolutePath), null, null)
        }
    }

    private fun discardDownload(destination: DownloadDestination) {
        runCatching { destination.output.close() }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            contentResolver.delete(destination.uri, null, null)
        } else {
            destination.legacyFile?.delete()
        }
    }

    // ── Notification ─────────────────────────────────────────────────────────────

    private fun broadcastProgress(itemId: String, loaded: Long, total: Long) {
        lbm.sendBroadcast(Intent(ACTION_PROGRESS).apply {
            putExtra("itemId", itemId)
            putExtra("loaded", loaded)
            putExtra("total", total)
        })
    }

    private fun updateNotif(name: String, itemId: String, loaded: Long, total: Long) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotif(name, itemId, loaded, total))
    }

    private fun buildNotif(name: String, itemId: String, loaded: Long, total: Long): Notification {
        val progress = if (total > 0) ((loaded.toDouble() / total) * 100).toInt() else 0
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(name)
            .setContentText(if (total > 0) "${mb(loaded)} / ${mb(total)} MB" else "${mb(loaded)} MB")
            .setProgress(100, progress, total <= 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
        if (itemId.isNotEmpty()) {
            val cancelIntent = Intent(this, DownloadService::class.java).apply {
                action = ACTION_CANCEL
                putExtra("itemId", itemId)
            }
            val cancelPi = PendingIntent.getService(
                this, itemId.hashCode(),
                cancelIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(android.R.drawable.ic_delete, "Cancel", cancelPi)
        }
        return builder.build()
    }

    private fun mb(bytes: Long) = "%.1f".format(bytes / 1_048_576.0)

    private fun createChannel() {
        val ch = NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW)
        ch.description = "File download progress"
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }

    // ── Queue persistence ────────────────────────────────────────────────────────

    private fun persistQueue() {
        val arr = JSONArray()
        queue.forEach { t ->
            arr.put(JSONObject().apply {
                put("itemId", t.itemId)
                put("url", t.url)
                put("destPath", t.destPath)
                put("itemName", t.itemName)
                put("estimatedSize", t.estimatedSize)
                val h = JSONObject()
                t.headers.forEach { (k, v) -> h.put(k, v) }
                put("headers", h)
            })
        }
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putString(PREFS_KEY, arr.toString()).apply()
    }

    private fun restoreQueue() {
        val json = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .getString(PREFS_KEY, "[]") ?: return
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val headers = mutableMapOf<String, String>()
                o.optJSONObject("headers")?.let { h ->
                    h.keys().forEach { k -> headers[k] = h.getString(k) }
                }
                queue.addLast(Task(
                    itemId       = o.getString("itemId"),
                    url          = o.getString("url"),
                    headers      = headers,
                    destPath     = o.getString("destPath"),
                    itemName     = o.optString("itemName", ""),
                    estimatedSize = o.optLong("estimatedSize", 0L),
                ))
            }
        } catch (e: Exception) {
            android.util.Log.e("DownloadService", "restoreQueue error: $e")
        }
        if (queue.isNotEmpty()) {
            ServiceCompat.startForeground(
                this, NOTIF_ID, buildNotif("Resuming downloads…", "", 0L, -1L),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
            ensureWorkerRunning()
        }
    }

    private fun savePendingComplete(itemId: String, filePath: String, fileSize: Long) {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        try {
            val arr = JSONArray(prefs.getString(PREFS_KEY_DONE, "[]") ?: "[]")
            arr.put(JSONObject().apply {
                put("itemId",   itemId)
                put("filePath", filePath)
                put("fileSize", fileSize)
            })
            prefs.edit().putString(PREFS_KEY_DONE, arr.toString()).apply()
        } catch (e: Exception) {
            android.util.Log.e("DownloadService", "savePendingComplete error: $e")
        }
    }

    // ── Intent parsing ────────────────────────────────────────────────────────────

    private fun Intent.toTask(): Task? {
        val itemId        = getStringExtra("itemId")   ?: return null
        val url           = getStringExtra("url")      ?: return null
        val destPath      = getStringExtra("destPath") ?: return null
        val itemName      = getStringExtra("itemName") ?: ""
        val estimatedSize = getLongExtra("estimatedSize", 0L)
        val headers       = mutableMapOf<String, String>()
        try {
            val h = JSONObject(getStringExtra("headers") ?: "{}")
            h.keys().forEach { k -> headers[k] = h.getString(k) }
        } catch (_: Exception) { }
        return Task(itemId, url, headers, destPath, itemName, estimatedSize)
    }
}
