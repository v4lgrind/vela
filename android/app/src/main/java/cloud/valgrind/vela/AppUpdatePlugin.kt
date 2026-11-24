package cloud.valgrind.vela

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

private const val TAG = "AppUpdatePlugin"
private const val APK_MIME = "application/vnd.android.package-archive"
private const val PROGRESS_INTERVAL_MS = 250L

/** Why a downloaded update can't be installed, or null when it can. */
internal object UpdateApkCheck {
    fun rejectReason(expectedPackage: String, installedCode: Long, apkPackage: String?, apkCode: Long?): String? =
        when {
            apkPackage == null || apkCode == null -> "invalid_apk"
            apkPackage != expectedPackage -> "wrong_package"
            apkCode <= installedCode -> "not_newer"
            else -> null
        }
}

/**
 * Self-update outside the Play Store: downloads a newer Vela APK into the cache
 * and hands it to the system package installer. Android still asks the user to
 * confirm, and refuses an APK whose signature doesn't match the installed app.
 */
@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var cancelled = false

    private val updateDir get() = File(context.cacheDir, "updates")
    private val updateFile get() = File(updateDir, "vela-update.apk")

    /** Leftovers of an earlier download: the update is either installed or stale. */
    override fun load() {
        executor.execute { updateDir.deleteRecursively() }
    }

    /** Whether the user has let Vela install apps ("Install unknown apps"). */
    @PluginMethod
    fun canInstall(call: PluginCall) {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()
        call.resolve(JSObject().put("allowed", allowed))
    }

    /** Opens the system screen where the user allows Vela to install apps. */
    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            )
            activity.startActivity(intent)
        }
        call.resolve()
    }

    /** Downloads the APK at `url` (https), emitting `downloadProgress`, then checks it. */
    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url")
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https URL is required", "insecure_url")
            return
        }
        cancelled = false
        executor.execute { downloadAndCheck(url, call) }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        cancelled = true
        call.resolve()
    }

    /** Starts the system installer on the downloaded APK. */
    @PluginMethod
    fun install(call: PluginCall) {
        val file = updateFile
        if (!file.exists()) {
            call.reject("No downloaded update", "no_update")
            return
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.startActivity(intent)
        call.resolve()
    }

    private fun downloadAndCheck(url: String, call: PluginCall) {
        try {
            updateDir.mkdirs()
            fetch(url, updateFile)
            val reason = rejectReason(updateFile)
            if (reason != null) {
                updateFile.delete()
                call.reject("Downloaded APK rejected: $reason", reason)
                return
            }
            call.resolve()
        } catch (e: Exception) {
            updateFile.delete()
            val code = if (cancelled) "cancelled" else "download_failed"
            Log.w(TAG, "Update download failed ($code)", e)
            call.reject(e.message ?: code, code)
        }
    }

    private fun fetch(url: String, target: File) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        try {
            if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
            copyWithProgress(connection, target)
        } finally {
            connection.disconnect()
        }
    }

    private fun copyWithProgress(connection: HttpURLConnection, target: File) {
        val total = connection.contentLengthLong
        var received = 0L
        var lastEmit = 0L
        connection.inputStream.use { input ->
            target.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    if (cancelled) throw IOException("cancelled")
                    val read = input.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    received += read
                    val now = SystemClock.elapsedRealtime()
                    if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
                        lastEmit = now
                        emitProgress(received, total)
                    }
                }
            }
        }
        emitProgress(received, total)
    }

    private fun emitProgress(received: Long, total: Long) {
        notifyListeners("downloadProgress", JSObject().put("received", received).put("total", total))
    }

    private fun rejectReason(apk: File): String? {
        val pm = context.packageManager
        val installed = PackageInfoCompat.getLongVersionCode(pm.getPackageInfo(context.packageName, 0))
        val archive = pm.getPackageArchiveInfo(apk.path, 0)
        return UpdateApkCheck.rejectReason(
            context.packageName,
            installed,
            archive?.packageName,
            archive?.let { PackageInfoCompat.getLongVersionCode(it) },
        )
    }
}
