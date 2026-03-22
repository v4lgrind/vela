package com.jellyfin_v4lgrind_client.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
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

        // Always start with a clean receiver so a stale one from a previous session
        // (e.g. quality switch) can never prevent the new receiver from being registered.
        unregisterEventReceiver()
        registerEventReceiver()

        // Quality presets & stream info
        val qualityPresetsJson = call.getString("qualityPresets") ?: "[]"
        val selectedBitrate = call.data.optInt("selectedBitrate", 0)
        val streamInfo = call.getString("streamInfo") ?: ""
        val audioTracksJson = call.getString("audioTracksJson") ?: "[]"
        val selectedAudioIndex = call.data.optInt("selectedAudioIndex", -1)
        val subtitleTextSize = call.data.optDouble("subtitleTextSize", 1.0).toFloat()

        val intent = Intent(activity, NativePlayerActivity::class.java).apply {
            putExtra(NativePlayerActivity.EXTRA_URL, url)
            putExtra(NativePlayerActivity.EXTRA_AUTH_HEADER, authHeader)
            putExtra(NativePlayerActivity.EXTRA_START_MS, startPositionMs)
            putExtra(NativePlayerActivity.EXTRA_TITLE, title)
            putExtra(NativePlayerActivity.EXTRA_PLAY_METHOD, playMethod)
            putExtra(NativePlayerActivity.EXTRA_SUBTITLE_TRACKS, subtitleTracksJson)
            putExtra(NativePlayerActivity.EXTRA_QUALITY_PRESETS, qualityPresetsJson)
            putExtra(NativePlayerActivity.EXTRA_SELECTED_BITRATE, selectedBitrate)
            putExtra(NativePlayerActivity.EXTRA_STREAM_INFO, streamInfo)
            putExtra(NativePlayerActivity.EXTRA_AUDIO_TRACKS, audioTracksJson)
            putExtra(NativePlayerActivity.EXTRA_SELECTED_AUDIO_INDEX, selectedAudioIndex)
            putExtra(NativePlayerActivity.EXTRA_SUBTITLE_TEXT_SIZE, subtitleTextSize)
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
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
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
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun setIntroTimestamps(call: PluginCall) {
        val introStartMs = call.getLong("introStartMs") ?: -1L
        val introEndMs = call.getLong("introEndMs") ?: -1L
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_SET_INTRO)
        intent.putExtra("introStartMs", introStartMs)
        intent.putExtra("introEndMs", introEndMs)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
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
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun updateStreamInfo(call: PluginCall) {
        val streamInfo = call.getString("streamInfo") ?: ""
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_UPDATE_STREAM_INFO)
        intent.putExtra("streamInfo", streamInfo)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun updateQualityPresets(call: PluginCall) {
        val presets = call.getString("presets") ?: "[]"
        val selectedBitrate = call.data.optInt("selectedBitrate", 0)
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_UPDATE_QUALITY_PRESETS)
        intent.putExtra("presets", presets)
        intent.putExtra("selectedBitrate", selectedBitrate)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun getDeviceCodecs(call: PluginCall) {
        val codecList = android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS)
        val decoderTypes = codecList.codecInfos
            .filter { !it.isEncoder }
            .flatMap { it.supportedTypes.toList() }
            .filter { it.startsWith("audio/") || it.startsWith("video/") }
            .distinct()
            .sorted()
        val result = JSObject()
        result.put("codecs", com.getcapacitor.JSArray(decoderTypes))
        call.resolve(result)
    }

    @PluginMethod
    fun canDecodeHevc(call: PluginCall) {
        val profileStr = (call.getString("profile") ?: "main").lowercase().trim()
        val jellyfinLevel = call.getInt("level") ?: 0

        // Map Jellyfin profile string → Android HEVCProfile integer
        val targetProfile = when (profileStr) {
            "main"               -> android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMain
            "main 10", "main10"  -> android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10
            "main still picture" -> android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMainStill
            "main 10 hdr10"      -> android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10
            "main 10 hdr10 plus" -> android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus
            else -> -1 // unknown → assume supported
        }

        if (targetProfile == -1 || jellyfinLevel == 0) {
            call.resolve(JSObject().apply { put("supported", true) })
            return
        }

        // Map Android HEVC level constants → Jellyfin level (H.265 level_idc = level × 30).
        // Both Main tier and High tier entries are included; either suffices.
        val levelMap = mapOf(
            0x1 to 30,   0x2 to 30,             // L1.0
            0x4 to 60,   0x8 to 60,             // L2.0
            0x10 to 63,  0x20 to 63,            // L2.1
            0x40 to 90,  0x80 to 90,            // L3.0
            0x100 to 93, 0x200 to 93,           // L3.1
            0x400 to 120, 0x800 to 120,         // L4.0
            0x1000 to 123, 0x2000 to 123,       // L4.1
            0x4000 to 150, 0x8000 to 150,       // L5.0
            0x10000 to 153, 0x20000 to 153,     // L5.1
            0x40000 to 156, 0x80000 to 156,     // L5.2
            0x100000 to 180, 0x200000 to 180,   // L6.0
            0x400000 to 183, 0x800000 to 183,   // L6.1
            0x1000000 to 186, 0x2000000 to 186  // L6.2
        )

        val supported = android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS)
            .codecInfos
            .filter { !it.isEncoder }
            .filter { info -> info.supportedTypes.contains("video/hevc") }
            .any { info ->
                info.getCapabilitiesForType("video/hevc").profileLevels.any { pl ->
                    pl.profile == targetProfile &&
                    (levelMap[pl.level] ?: 0) >= jellyfinLevel
                }
            }

        call.resolve(JSObject().apply { put("supported", supported) })
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private fun sendCommand(command: String) {
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", command)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
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
                        data.put("groupIndex", intent.getIntExtra("groupIndex", -1))
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
                    NativePlayerActivity.ACTION_QUALITY_SELECTED -> {
                        val bitrate = intent.getIntExtra("bitrate", 0)
                        val data = JSObject()
                        data.put("bitrate", bitrate)
                        notifyListeners("qualitySelected", data)
                    }
                    NativePlayerActivity.ACTION_AUDIO_ERROR -> {
                        val data = JSObject()
                        data.put("groupIndex", intent.getIntExtra("groupIndex", -1))
                        data.put("language", intent.getStringExtra("language") ?: "und")
                        notifyListeners("audioError", data)
                    }
                    NativePlayerActivity.ACTION_AUDIO_SWITCH_JELLYFIN -> {
                        val data = JSObject()
                        data.put("jellyfinIndex", intent.getIntExtra("jellyfinIndex", -1))
                        notifyListeners("audioSwitchJellyfin", data)
                    }
                    NativePlayerActivity.ACTION_VIDEO_ERROR -> {
                        val data = JSObject()
                        data.put("reason", intent.getStringExtra("reason") ?: "unknown")
                        data.put("positionMs", intent.getLongExtra("positionMs", 0L))
                        notifyListeners("videoError", data)
                        unregisterEventReceiver()
                    }
                    NativePlayerActivity.ACTION_DEBUG_LOG -> {
                        val data = JSObject()
                        data.put("message", intent.getStringExtra("message") ?: "")
                        notifyListeners("debugLog", data)
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
            addAction(NativePlayerActivity.ACTION_QUALITY_SELECTED)
            addAction(NativePlayerActivity.ACTION_AUDIO_ERROR)
            addAction(NativePlayerActivity.ACTION_AUDIO_SWITCH_JELLYFIN)
            addAction(NativePlayerActivity.ACTION_VIDEO_ERROR)
            addAction(NativePlayerActivity.ACTION_DEBUG_LOG)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        eventReceiver = receiver
    }

    private fun unregisterEventReceiver() {
        eventReceiver?.let {
            context.unregisterReceiver(it)
            eventReceiver = null
        }
    }

    override fun handleOnDestroy() {
        unregisterEventReceiver()
        super.handleOnDestroy()
    }
}
