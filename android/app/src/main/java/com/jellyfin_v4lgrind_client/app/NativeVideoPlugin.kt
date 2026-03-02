package com.jellyfin_v4lgrind_client.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeVideo")
class NativeVideoPlugin : Plugin() {

    private var eventReceiver: BroadcastReceiver? = null

    @PluginMethod
    fun start(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url is required")
            return
        }
        val authHeader = call.getString("authHeader") ?: ""
        // call.getLong() only matches JSON Long type; JS numbers within int range arrive as Integer.
        // optLong() coerces Integer → Long correctly.
        val startPositionMs = call.data.optLong("startPositionMs", 0L)
        android.util.Log.d("NativePlayer", "plugin.start: startPositionMs=$startPositionMs")
        val title = call.getString("title") ?: ""
        val playMethod = call.getString("playMethod") ?: "Transcode"

        // Subtitle tracks: array of {url, lang, label}
        val subtitleTracksJs = call.getArray("subtitleTracks")
        val subtitleTracksJson = subtitleTracksJs?.toString() ?: "[]"

        registerEventReceiver()

        val intent = Intent(activity, NativePlayerActivity::class.java).apply {
            putExtra(NativePlayerActivity.EXTRA_URL, url)
            putExtra(NativePlayerActivity.EXTRA_AUTH_HEADER, authHeader)
            putExtra(NativePlayerActivity.EXTRA_START_MS, startPositionMs)
            putExtra(NativePlayerActivity.EXTRA_TITLE, title)
            putExtra(NativePlayerActivity.EXTRA_PLAY_METHOD, playMethod)
            putExtra(NativePlayerActivity.EXTRA_SUBTITLE_TRACKS, subtitleTracksJson)
        }
        activity.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        sendCommand(NativePlayerActivity.CMD_STOP)
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        sendCommand(NativePlayerActivity.CMD_PAUSE)
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        sendCommand(NativePlayerActivity.CMD_RESUME)
        call.resolve()
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val posMs = call.getLong("positionMs") ?: run {
            call.reject("positionMs is required")
            return
        }
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_SEEK)
        intent.putExtra("positionMs", posMs)
        LocalBroadcastManager.getInstance(context).sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun selectAudioTrack(call: PluginCall) {
        val groupIndex = call.getInt("groupIndex") ?: run {
            call.reject("groupIndex is required")
            return
        }
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_SELECT_AUDIO)
        intent.putExtra("groupIndex", groupIndex)
        LocalBroadcastManager.getInstance(context).sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun nativeLog(call: PluginCall) {
        val message = call.getString("message") ?: return
        android.util.Log.d("NativePlayer", message)
        call.resolve()
    }

    @PluginMethod
    fun selectSubtitleTrack(call: PluginCall) {
        val groupIndex = call.getInt("groupIndex") ?: -1
        android.util.Log.d("NativePlayer", "[Subtitles] plugin.selectSubtitleTrack: JS requested groupIndex=$groupIndex")
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_SELECT_SUBTITLE)
        intent.putExtra("groupIndex", groupIndex)
        LocalBroadcastManager.getInstance(context).sendBroadcast(intent)
        call.resolve()
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private fun sendCommand(command: String) {
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", command)
        LocalBroadcastManager.getInstance(context).sendBroadcast(intent)
    }

    private fun registerEventReceiver() {
        if (eventReceiver != null) return

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {
                    NativePlayerActivity.ACTION_PROGRESS -> {
                        val posMs = intent.getLongExtra("positionMs", 0L)
                        val durMs = intent.getLongExtra("durationMs", 0L)
                        val data = JSObject()
                        data.put("positionMs", posMs)
                        data.put("durationMs", durMs)
                        notifyListeners("progress", data)
                    }
                    NativePlayerActivity.ACTION_ENDED -> {
                        notifyListeners("ended", JSObject())
                        unregisterEventReceiver()
                    }
                    NativePlayerActivity.ACTION_STOPPED -> {
                        val posMs = intent.getLongExtra("positionMs", 0L)
                        val durMs = intent.getLongExtra("durationMs", 0L)
                        val data = JSObject()
                        data.put("positionMs", posMs)
                        data.put("durationMs", durMs)
                        notifyListeners("stopped", data)
                        unregisterEventReceiver()
                    }
                    NativePlayerActivity.ACTION_ERROR -> {
                        val message = intent.getStringExtra("message") ?: "Unknown error"
                        val data = JSObject()
                        data.put("message", message)
                        notifyListeners("error", data)
                        unregisterEventReceiver()
                    }
                    NativePlayerActivity.ACTION_TRACKS -> {
                        val tracksJson = intent.getStringExtra("tracks") ?: "{}"
                        val data = JSObject()
                        data.put("tracks", tracksJson)
                        notifyListeners("tracksReady", data)
                    }
                    NativePlayerActivity.ACTION_AUDIO_SELECTED -> {
                        val language = intent.getStringExtra("language") ?: "und"
                        val data = JSObject()
                        data.put("language", language)
                        notifyListeners("audioSelected", data)
                    }
                    NativePlayerActivity.ACTION_SUBTITLE_SELECTED -> {
                        val groupIndex = intent.getIntExtra("groupIndex", -1)
                        val label = intent.getStringExtra("label") ?: ""
                        android.util.Log.d("NativePlayer", "[Subtitles] plugin.subtitleSelected event: groupIndex=$groupIndex label=$label")
                        val data = JSObject()
                        data.put("groupIndex", groupIndex)
                        data.put("label", label)
                        notifyListeners("subtitleSelected", data)
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(NativePlayerActivity.ACTION_PROGRESS)
            addAction(NativePlayerActivity.ACTION_ENDED)
            addAction(NativePlayerActivity.ACTION_STOPPED)
            addAction(NativePlayerActivity.ACTION_ERROR)
            addAction(NativePlayerActivity.ACTION_TRACKS)
            addAction(NativePlayerActivity.ACTION_AUDIO_SELECTED)
            addAction(NativePlayerActivity.ACTION_SUBTITLE_SELECTED)
        }
        LocalBroadcastManager.getInstance(context).registerReceiver(receiver, filter)
        eventReceiver = receiver
    }

    private fun unregisterEventReceiver() {
        eventReceiver?.let {
            LocalBroadcastManager.getInstance(context).unregisterReceiver(it)
            eventReceiver = null
        }
    }

    override fun handleOnDestroy() {
        unregisterEventReceiver()
        super.handleOnDestroy()
    }
}
