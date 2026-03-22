package com.jellyfin_v4lgrind_client.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "Download")
class DownloadPlugin : Plugin() {

    private var broadcastReceiver: BroadcastReceiver? = null
    private lateinit var lbm: LocalBroadcastManager

    override fun load() {
        lbm = LocalBroadcastManager.getInstance(context)
        registerReceiver()
    }

    @PluginMethod
    fun enqueue(call: PluginCall) {
        val itemId   = call.getString("itemId")   ?: run { call.reject("itemId is required");   return }
        val url      = call.getString("url")      ?: run { call.reject("url is required");      return }
        val destPath = call.getString("destPath") ?: run { call.reject("destPath is required"); return }
        val itemName      = call.getString("itemName") ?: ""
        val estimatedSize = call.data.optLong("estimatedSize", 0L)
        val headersJson   = call.getObject("headers")?.toString() ?: "{}"

        val intent = Intent(context, DownloadService::class.java).apply {
            action = DownloadService.ACTION_ENQUEUE
            putExtra("itemId",        itemId)
            putExtra("url",           url)
            putExtra("destPath",      destPath)
            putExtra("itemName",      itemName)
            putExtra("estimatedSize", estimatedSize)
            putExtra("headers",       headersJson)
        }
        context.startForegroundService(intent)
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val itemId = call.getString("itemId") ?: run { call.reject("itemId is required"); return }
        val intent = Intent(context, DownloadService::class.java).apply {
            action = DownloadService.ACTION_CANCEL
            putExtra("itemId", itemId)
        }
        context.startService(intent)
        call.resolve()
    }

    /**
     * Returns downloads that completed natively while the JS layer was not running
     * (e.g. app was killed). Clears the list after reading so items are only returned once.
     */
    @PluginMethod
    fun getPendingCompletions(call: PluginCall) {
        val prefs = context.getSharedPreferences("dl_prefs", android.content.Context.MODE_PRIVATE)
        val json = prefs.getString("dl_done", "[]") ?: "[]"
        try {
            val arr = JSONArray(json)
            val items = JSArray()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                items.put(JSObject().apply {
                    put("itemId",   o.getString("itemId"))
                    put("filePath", o.getString("filePath"))
                    put("fileSize", o.getLong("fileSize"))
                })
            }
            prefs.edit().putString("dl_done", "[]").apply()
            call.resolve(JSObject().apply { put("items", items) })
        } catch (e: Exception) {
            android.util.Log.e("DownloadPlugin", "getPendingCompletions error: $e")
            call.resolve(JSObject().apply { put("items", JSArray()) })
        }
    }

    // ── LocalBroadcast receiver ───────────────────────────────────────────────

    private fun registerReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val itemId = intent.getStringExtra("itemId") ?: return
                when (intent.action) {
                    DownloadService.ACTION_PROGRESS -> {
                        val data = JSObject().apply {
                            put("itemId", itemId)
                            put("loaded", intent.getLongExtra("loaded", 0L))
                            put("total",  intent.getLongExtra("total",  0L))
                        }
                        notifyListeners("downloadProgress", data)
                    }
                    DownloadService.ACTION_COMPLETE -> {
                        val data = JSObject().apply {
                            put("itemId",   itemId)
                            put("filePath", intent.getStringExtra("filePath") ?: "")
                            put("fileSize", intent.getLongExtra("fileSize", 0L))
                        }
                        notifyListeners("downloadComplete", data)
                    }
                    DownloadService.ACTION_FAILED -> {
                        val data = JSObject().apply {
                            put("itemId", itemId)
                            put("error",  intent.getStringExtra("error") ?: "Download failed")
                        }
                        notifyListeners("downloadFailed", data)
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(DownloadService.ACTION_PROGRESS)
            addAction(DownloadService.ACTION_COMPLETE)
            addAction(DownloadService.ACTION_FAILED)
        }
        lbm.registerReceiver(receiver, filter)
        broadcastReceiver = receiver
    }

    override fun handleOnDestroy() {
        broadcastReceiver?.let { lbm.unregisterReceiver(it) }
        super.handleOnDestroy()
    }
}
