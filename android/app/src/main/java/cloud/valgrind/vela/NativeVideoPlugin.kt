package cloud.valgrind.vela

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.MediaCodecInfo.CodecProfileLevel
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
        // Headers every request of the stream needs (Jellyfin Authorization, Plex X-Plex-*).
        val headersJson = call.getObject("headers")?.toString() ?: "{}"
        // call.getLong() only matches JSON Long type; JS numbers within int range arrive as Integer.
        // optLong() coerces Integer → Long correctly.
        val startPositionMs = call.data.optLong("startPositionMs", 0L)
        android.util.Log.d("NativePlayer", "plugin.start: startPositionMs=$startPositionMs")
        val title = call.getString("title") ?: ""
        val playMethod = call.getString("playMethod") ?: "Transcode"

        // Subtitle tracks: array of {url, lang, label}
        val subtitleTracksJs = call.getArray("subtitleTracks")
        val subtitleTracksJson = subtitleTracksJs?.toString() ?: "[]"
        val burnInSubtitleTracksJs = call.getArray("burnInSubtitleTracks")
        val burnInSubtitleTracksJson = burnInSubtitleTracksJs?.toString() ?: "[]"
        val selectedBurnInSubtitleIndex = call.data.optInt("selectedBurnInSubtitleIndex", -1)

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

        val nextEpisodeId = call.getString("nextEpisodeId") ?: ""
        val chaptersJson = call.getString("chaptersJson") ?: "[]"

        val intent = Intent(activity, NativePlayerActivity::class.java).apply {
            putExtra(NativePlayerActivity.EXTRA_URL, url)
            putExtra(NativePlayerActivity.EXTRA_HEADERS, headersJson)
            putExtra(NativePlayerActivity.EXTRA_START_MS, startPositionMs)
            putExtra(NativePlayerActivity.EXTRA_TITLE, title)
            putExtra(NativePlayerActivity.EXTRA_PLAY_METHOD, playMethod)
            putExtra(NativePlayerActivity.EXTRA_SUBTITLE_TRACKS, subtitleTracksJson)
            putExtra(NativePlayerActivity.EXTRA_BURN_IN_SUBTITLE_TRACKS, burnInSubtitleTracksJson)
            putExtra(
                NativePlayerActivity.EXTRA_SELECTED_BURN_IN_SUBTITLE_INDEX,
                selectedBurnInSubtitleIndex
            )
            putExtra(NativePlayerActivity.EXTRA_QUALITY_PRESETS, qualityPresetsJson)
            putExtra(NativePlayerActivity.EXTRA_SELECTED_BITRATE, selectedBitrate)
            putExtra(NativePlayerActivity.EXTRA_STREAM_INFO, streamInfo)
            putExtra(NativePlayerActivity.EXTRA_AUDIO_TRACKS, audioTracksJson)
            putExtra(NativePlayerActivity.EXTRA_SELECTED_AUDIO_INDEX, selectedAudioIndex)
            putExtra(NativePlayerActivity.EXTRA_SUBTITLE_TEXT_SIZE, subtitleTextSize)
            putExtra(NativePlayerActivity.EXTRA_NEXT_EPISODE_ID, nextEpisodeId)
            putExtra(NativePlayerActivity.EXTRA_CHAPTERS_JSON, chaptersJson)
            putExtra(NativePlayerActivity.EXTRA_CREDITS_START_MS, call.data.optLong("creditsStartMs", -1L))
            putExtra(NativePlayerActivity.EXTRA_DURATION_HINT_MS, call.data.optLong("durationHintMs", 0L))
            putExtra(NativePlayerActivity.EXTRA_SRT_FILE_PATH, call.data.optString("srtFilePath", ""))
            putExtra(NativePlayerActivity.EXTRA_TRICKPLAY_JSON, call.data.optString("trickplayJson", ""))
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
        // getLong() only matches JSON Long; JS numbers in int range arrive as Integer.
        // optLong() coerces Integer → Long correctly (same issue as startPositionMs in start()).
        val introStartMs = call.data.optLong("introStartMs", -1L)
        val introEndMs = call.data.optLong("introEndMs", -1L)
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
    fun getDeviceCapabilities(call: PluginCall) {
        val decoderInfos = android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS)
            .codecInfos
            .filter { !it.isEncoder }
        val hardwareVideoCodecs = linkedSetOf<String>()
        val softwareVideoCodecs = linkedSetOf<String>()
        val platformAudioCodecs = linkedSetOf<String>()

        decoderInfos.forEach { info ->
            info.supportedTypes.forEach { mime ->
                when {
                    mime.startsWith("video/") && isHardwareDecoder(info) ->
                        hardwareVideoCodecs.add(mime.lowercase())
                    mime.startsWith("video/") ->
                        softwareVideoCodecs.add(mime.lowercase())
                    mime.startsWith("audio/") ->
                        platformAudioCodecs.add(mime.lowercase())
                }
            }
        }

        val ffmpegAudioCandidates = listOf(
            "audio/mp4a-latm", "audio/mpeg", "audio/mpeg-L1", "audio/mpeg-L2",
            "audio/ac3", "audio/eac3", "audio/eac3-joc", "audio/true-hd",
            "audio/vnd.dts", "audio/vnd.dts.hd", "audio/vorbis", "audio/opus",
            "audio/flac", "audio/alac"
        )
        val ffmpegVideoCandidates = listOf("video/avc", "video/hevc")
        val ffmpegAvailable = androidx.media3.decoder.ffmpeg.FfmpegLibrary.isAvailable()
        val ffmpegAudioCodecs = if (ffmpegAvailable) {
            ffmpegAudioCandidates.filter {
                androidx.media3.decoder.ffmpeg.FfmpegLibrary.supportsFormat(it)
            }
        } else emptyList()
        val ffmpegVideoCodecs = if (ffmpegAvailable) {
            ffmpegVideoCandidates.filter {
                androidx.media3.decoder.ffmpeg.FfmpegLibrary.supportsFormat(it)
            }
        } else emptyList()

        val (displayWidth, displayHeight) = physicalDisplaySize()
        call.resolve(JSObject().apply {
            put("hardwareVideoCodecs", com.getcapacitor.JSArray(hardwareVideoCodecs.sorted()))
            put("softwareVideoCodecs", com.getcapacitor.JSArray(softwareVideoCodecs.sorted()))
            put("platformAudioCodecs", com.getcapacitor.JSArray(platformAudioCodecs.sorted()))
            put("ffmpegAudioCodecs", com.getcapacitor.JSArray(ffmpegAudioCodecs.sorted()))
            put("ffmpegVideoCodecs", com.getcapacitor.JSArray(ffmpegVideoCodecs.sorted()))
            put("displayWidth", displayWidth)
            put("displayHeight", displayHeight)
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("model", android.os.Build.MODEL)
            put("androidApi", android.os.Build.VERSION.SDK_INT)
        })
    }

    @PluginMethod
    fun canDecodeVideo(call: PluginCall) {
        val mime = (call.getString("mime") ?: "").lowercase()
        if (!mime.startsWith("video/")) {
            call.reject("A video MIME type is required")
            return
        }

        val profile = (call.getString("profile") ?: "").lowercase().trim()
        val jellyfinLevel = call.getInt("level") ?: 0
        val bitDepth = call.getInt("bitDepth") ?: 8
        val width = call.getInt("width") ?: 0
        val height = call.getInt("height") ?: 0
        val frameRate = call.data.optDouble("frameRate", 0.0)
        val targetProfile = androidVideoProfile(mime, profile, bitDepth)

        val decoders = android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS)
            .codecInfos
            .filter {
                !it.isEncoder &&
                    isHardwareDecoder(it) &&
                    it.supportedTypes.any { type -> type.equals(mime, ignoreCase = true) }
            }

        var decoderName = ""
        var profileMatched = false
        var sizeMatched = false
        val supported = decoders.any { info ->
            val capabilities = runCatching { info.getCapabilitiesForType(mime) }.getOrNull()
                ?: return@any false
            val profileSupported = targetProfile == null || capabilities.profileLevels.any { level ->
                level.profile == targetProfile &&
                    (jellyfinLevel <= 0 || androidVideoLevel(mime, level.level) >= jellyfinLevel)
            }
            if (profileSupported) profileMatched = true

            val sizeSupported = if (width > 0 && height > 0) {
                runCatching {
                    val videoCapabilities = capabilities.videoCapabilities
                        ?: return@runCatching false
                    if (frameRate > 0.0) {
                        videoCapabilities.areSizeAndRateSupported(width, height, frameRate)
                    } else {
                        videoCapabilities.isSizeSupported(width, height)
                    }
                }.getOrDefault(false)
            } else {
                true
            }
            if (sizeSupported) sizeMatched = true
            if (profileSupported && sizeSupported) {
                decoderName = info.name
                true
            } else {
                false
            }
        }

        val reason = when {
            supported -> "supported"
            decoders.isEmpty() -> "no_hardware_decoder"
            !profileMatched -> "unsupported_profile_or_level"
            !sizeMatched -> "unsupported_size_or_rate"
            else -> "unsupported"
        }
        android.util.Log.d(
            "NativePlayer",
            "canDecodeVideo: mime=$mime profile=$profile level=$jellyfinLevel bitDepth=$bitDepth " +
                "size=${width}x$height fps=$frameRate supported=$supported decoder=$decoderName reason=$reason"
        )
        call.resolve(JSObject().apply {
            put("supported", supported)
            put("decoderName", decoderName)
            put("reason", reason)
        })
    }

    /**
     * Panel resolution of the active display mode. displayMetrics reports the
     * app window instead: 1080p UI on 4K Android TV, or minus system bars on
     * devices without edge-to-edge, which would trigger needless transcodes.
     */
    private fun physicalDisplaySize(): Pair<Int, Int> {
        val displayManager = context.getSystemService(android.content.Context.DISPLAY_SERVICE)
            as android.hardware.display.DisplayManager
        val mode = displayManager.getDisplay(android.view.Display.DEFAULT_DISPLAY)?.mode
        if (mode != null && mode.physicalWidth > 0 && mode.physicalHeight > 0) {
            return mode.physicalWidth to mode.physicalHeight
        }
        val metrics = context.resources.displayMetrics
        return metrics.widthPixels to metrics.heightPixels
    }

    private fun isHardwareDecoder(info: android.media.MediaCodecInfo): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= 29) {
            info.isHardwareAccelerated
        } else {
            !info.name.startsWith("OMX.google.", ignoreCase = true) &&
                !info.name.startsWith("c2.android.", ignoreCase = true)
        }
    }
    private fun androidVideoProfile(mime: String, profile: String, bitDepth: Int): Int? {
        return when (mime) {
            "video/hevc" -> when (profile) {
                "main" -> CodecProfileLevel.HEVCProfileMain
                "main 10", "main10", "main 10 hdr10", "main 10 hdr10 plus" ->
                    CodecProfileLevel.HEVCProfileMain10
                "main still picture" -> CodecProfileLevel.HEVCProfileMainStill
                else -> if (bitDepth > 8) CodecProfileLevel.HEVCProfileMain10 else null
            }
            "video/avc" -> when (profile) {
                "baseline", "constrained baseline" -> CodecProfileLevel.AVCProfileBaseline
                "main" -> CodecProfileLevel.AVCProfileMain
                "high" -> CodecProfileLevel.AVCProfileHigh
                "high 10", "high10" -> CodecProfileLevel.AVCProfileHigh10
                else -> null
            }
            "video/av01" ->
                if (bitDepth > 8) CodecProfileLevel.AV1ProfileMain10 else CodecProfileLevel.AV1ProfileMain8
            "video/x-vnd.on2.vp9" ->
                if (bitDepth > 8) CodecProfileLevel.VP9Profile2 else CodecProfileLevel.VP9Profile0
            else -> null
        }
    }

    private fun androidVideoLevel(mime: String, androidLevel: Int): Int {
        return when (mime) {
            "video/hevc" -> when (androidLevel) {
                0x1, 0x2 -> 30
                0x4, 0x8 -> 60
                0x10, 0x20 -> 63
                0x40, 0x80 -> 90
                0x100, 0x200 -> 93
                0x400, 0x800 -> 120
                0x1000, 0x2000 -> 123
                0x4000, 0x8000 -> 150
                0x10000, 0x20000 -> 153
                0x40000, 0x80000 -> 156
                0x100000, 0x200000 -> 180
                0x400000, 0x800000 -> 183
                0x1000000, 0x2000000 -> 186
                else -> 0
            }
            "video/avc" -> when (androidLevel) {
                0x1 -> 10
                0x2 -> 9
                0x4 -> 11
                0x8 -> 12
                0x10 -> 13
                0x20 -> 20
                0x40 -> 21
                0x80 -> 22
                0x100 -> 30
                0x200 -> 31
                0x400 -> 32
                0x800 -> 40
                0x1000 -> 41
                0x2000 -> 42
                0x4000 -> 50
                0x8000 -> 51
                0x10000 -> 52
                0x20000 -> 60
                0x40000 -> 61
                0x80000 -> 62
                else -> 0
            }
            else -> Int.MAX_VALUE
        }
    }

    @PluginMethod
    fun setSubtitleSize(call: PluginCall) {
        val scale = call.data.optDouble("scale", 1.0).toFloat()
        val intent = Intent(NativePlayerActivity.ACTION_COMMAND)
        intent.putExtra("command", NativePlayerActivity.CMD_UPDATE_SUBTITLE_SIZE)
        intent.putExtra("subtitleSizeScale", scale)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
        call.resolve()
    }

    @PluginMethod
    fun getSafeAreaInsets(call: PluginCall) {
        val decorView = activity.window.decorView
        val insets = androidx.core.view.ViewCompat.getRootWindowInsets(decorView)
        val density = activity.resources.displayMetrics.density
        val result = JSObject()
        if (insets != null) {
            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            val cutout = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.displayCutout())
            result.put("top",    Math.round(maxOf(bars.top,    cutout.top)    / density))
            result.put("bottom", Math.round(maxOf(bars.bottom, cutout.bottom) / density))
            result.put("left",   Math.round(maxOf(bars.left,   cutout.left)   / density))
            result.put("right",  Math.round(maxOf(bars.right,  cutout.right)  / density))
        } else {
            result.put("top", 0.0); result.put("bottom", 0.0)
            result.put("left", 0.0); result.put("right", 0.0)
        }
        call.resolve(result)
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
                        android.util.Log.d(
                            "NativePlayer",
                            "[Subtitles] plugin.subtitleSelected event: groupIndex=$groupIndex label=$label"
                        )
                        val data = JSObject()
                        data.put("groupIndex", groupIndex)
                        data.put("label", label)
                        if (intent.hasExtra("burnInSubtitleIndex")) {
                            data.put(
                                "burnInSubtitleIndex",
                                intent.getIntExtra("burnInSubtitleIndex", -1)
                            )
                        }
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
                    NativePlayerActivity.ACTION_NEXT_EPISODE -> {
                        val data = JSObject()
                        data.put("nextEpisodeId", intent.getStringExtra("nextEpisodeId") ?: "")
                        notifyListeners("nextEpisode", data)
                    }
                    NativePlayerActivity.ACTION_DEBUG_LOG -> {
                        val data = JSObject()
                        data.put("message", intent.getStringExtra("message") ?: "")
                        notifyListeners("debugLog", data)
                    }
                    NativePlayerActivity.ACTION_SUBTITLE_SIZE_CHANGED -> {
                        val data = JSObject()
                        data.put("scale", intent.getFloatExtra("scale", 1.0f).toDouble())
                        notifyListeners("subtitleSizeChanged", data)
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
            addAction(NativePlayerActivity.ACTION_NEXT_EPISODE)
            addAction(NativePlayerActivity.ACTION_DEBUG_LOG)
            addAction(NativePlayerActivity.ACTION_SUBTITLE_SIZE_CHANGED)
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
