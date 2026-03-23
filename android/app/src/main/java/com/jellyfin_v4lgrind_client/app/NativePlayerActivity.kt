package com.jellyfin_v4lgrind_client.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.core.view.GestureDetectorCompat
import android.widget.Button
import android.widget.ImageButton
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackGroup
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.ui.PlayerNotificationManager
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject

class NativePlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_AUTH_HEADER = "authHeader"
        const val EXTRA_START_MS = "startPositionMs"
        const val EXTRA_TITLE = "title"
        const val EXTRA_PLAY_METHOD = "playMethod"
        const val EXTRA_SUBTITLE_TRACKS = "subtitleTracks"

        const val ACTION_COMMAND = "com.jellyfin_v4lgrind_client.app.PLAYER_COMMAND"
        const val ACTION_PROGRESS = "com.jellyfin_v4lgrind_client.app.PLAYER_PROGRESS"
        const val ACTION_ENDED = "com.jellyfin_v4lgrind_client.app.PLAYER_ENDED"
        const val ACTION_STOPPED = "com.jellyfin_v4lgrind_client.app.PLAYER_STOPPED"
        const val ACTION_ERROR = "com.jellyfin_v4lgrind_client.app.PLAYER_ERROR"
        const val ACTION_TRACKS = "com.jellyfin_v4lgrind_client.app.PLAYER_TRACKS"
        const val ACTION_AUDIO_SELECTED = "com.jellyfin_v4lgrind_client.app.AUDIO_SELECTED"
        const val ACTION_SUBTITLE_SELECTED = "com.jellyfin_v4lgrind_client.app.SUBTITLE_SELECTED"
        const val ACTION_QUALITY_SELECTED = "com.jellyfin_v4lgrind_client.app.QUALITY_SELECTED"
        const val ACTION_AUDIO_ERROR = "com.jellyfin_v4lgrind_client.app.AUDIO_ERROR"
        const val ACTION_AUDIO_SWITCH_JELLYFIN = "com.jellyfin_v4lgrind_client.app.AUDIO_SWITCH_JELLYFIN"
        const val ACTION_VIDEO_ERROR = "com.jellyfin_v4lgrind_client.app.VIDEO_ERROR"
        const val ACTION_DEBUG_LOG = "com.jellyfin_v4lgrind_client.app.DEBUG_LOG"

        const val EXTRA_AUDIO_TRACKS = "audioTracks"
        const val EXTRA_SELECTED_AUDIO_INDEX = "selectedAudioIndex"

        const val CMD_STOP = "stop"
        const val CMD_PAUSE = "pause"
        const val CMD_RESUME = "resume"
        const val CMD_SEEK = "seek"
        const val CMD_SELECT_AUDIO = "selectAudio"
        const val CMD_SELECT_SUBTITLE = "selectSubtitle"
        const val CMD_SET_INTRO = "setIntro"
        const val CMD_UPDATE_QUALITY_PRESETS = "updateQualityPresets"
        const val CMD_UPDATE_STREAM_INFO = "updateStreamInfo"
        const val CMD_UPDATE_SUBTITLE_SIZE = "updateSubtitleSize"

        const val EXTRA_QUALITY_PRESETS = "qualityPresets"
        const val EXTRA_SELECTED_BITRATE = "selectedBitrate"
        const val EXTRA_STREAM_INFO = "streamInfo"
        const val EXTRA_SUBTITLE_TEXT_SIZE = "subtitleTextSize"
        const val EXTRA_NEXT_EPISODE_ID = "nextEpisodeId"
        const val EXTRA_CHAPTERS_JSON = "chaptersJson"
        const val EXTRA_CREDITS_START_MS = "creditsStartMs"
        const val ACTION_NEXT_EPISODE = "com.jellyfin_v4lgrind_client.app.PLAYER_NEXT_EPISODE"
        const val ACTION_SUBTITLE_SIZE_CHANGED = "com.jellyfin_v4lgrind_client.app.SUBTITLE_SIZE_CHANGED"

        const val NOTIFICATION_ID = 1001
        const val NOTIFICATION_CHANNEL_ID = "media_playback"
    }

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var playerNotificationManager: PlayerNotificationManager? = null
    private lateinit var playerView: PlayerView
    private lateinit var controlsOverlay: View
    private lateinit var btnBack: ImageButton
    private lateinit var btnPlayPause: ImageButton
    private lateinit var btnAudio: ImageButton
    private lateinit var btnSubtitle: ImageButton
    private lateinit var btnFullscreen: ImageButton
    private lateinit var btnQuality: ImageButton
    private lateinit var btnInfo: ImageButton
    private lateinit var btnSkipIntro: Button
    private lateinit var btnNextEpisode: Button
    private lateinit var loadingSpinner: View
    private lateinit var seekBar: SeekBar
    private lateinit var chapterMarkersContainer: FrameLayout
    private var chapterMarkersAdded = false
    private lateinit var tvCurrentTime: TextView
    private lateinit var tvTotalTime: TextView
    private lateinit var tvTitle: TextView

    private lateinit var seekFeedbackBack: LinearLayout
    private lateinit var seekFeedbackFwd: LinearLayout
    private lateinit var gestureDetector: GestureDetectorCompat

    private val handler = Handler(Looper.getMainLooper())
    private var controlsVisible = true
    private var isFullscreen = true
    private var tracksReported = false
    private var stoppedSent = false

    // Track data parsed from ExoPlayer
    private val audioTrackGroups = mutableListOf<Pair<Int, TrackGroup>>() // groupIndex, group
    private val subtitleTrackGroups = mutableListOf<Pair<Int, TrackGroup>>()
    private var selectedAudioGroupIndex = -1
    private var selectedSubtitleGroupIndex = -1
    private var sidecarSubtitleCount = 0
    // Fallback subtitle info from Vue when ExoPlayer doesn't expose sidecar tracks
    private val sidecarSubtitles = mutableListOf<Pair<String, String>>() // (label, language)

    // Subtitle size scale (persisted via preferencesStore on Vue side; passed via intent)
    private var currentSubtitleScale = 1.0f

    // Quality presets & stream info (passed from Vue)
    private var qualityPresets = mutableListOf<Pair<Int, String>>() // (bitrate, label)
    private var selectedBitrate = 0
    private var streamInfoJson = ""

    // Jellyfin audio tracks passed from Vue — used when ExoPlayer only has 1 track (transcoded stream)
    // Triple: (jellyfinIndex, label, language)
    private val jellyfinAudioTracks = mutableListOf<Triple<Int, String, String>>()
    // The Jellyfin audio stream index that was requested for this playback session.
    // Used to pre-select the correct item in the audio picker for transcoded streams.
    private var selectedJellyfinAudioIndex = -1

    private val commandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getStringExtra("command")) {
                CMD_STOP -> {
                    // Suppress the stopped broadcast so the Vue stopped listener
                    // doesn't fire when the activity is being replaced (audio fallback).
                    stoppedSent = true
                    finish()
                }
                CMD_PAUSE -> player?.pause()
                CMD_RESUME -> player?.play()
                CMD_SEEK -> {
                    val ms = intent.getLongExtra("positionMs", 0L)
                    player?.seekTo(ms)
                }
                CMD_SELECT_AUDIO -> {
                    val groupIdx = intent.getIntExtra("groupIndex", -1)
                    selectAudioTrack(groupIdx)
                }
                CMD_SELECT_SUBTITLE -> {
                    val groupIdx = intent.getIntExtra("groupIndex", -1)
                    selectSubtitleTrack(groupIdx)
                }
                CMD_SET_INTRO -> {
                    introStartMs = intent.getLongExtra("introStartMs", -1L)
                    introEndMs = intent.getLongExtra("introEndMs", -1L)
                    introSkipped = false
                    android.util.Log.d("NativePlayer", "Intro set: $introStartMs-$introEndMs ms")
                }
                CMD_UPDATE_QUALITY_PRESETS -> {
                    val json = intent.getStringExtra("presets") ?: return
                    selectedBitrate = intent.getIntExtra("selectedBitrate", 0)
                    parseQualityPresets(json)
                    btnQuality.visibility = if (qualityPresets.size > 1) View.VISIBLE else View.GONE
                }
                CMD_UPDATE_STREAM_INFO -> {
                    streamInfoJson = intent.getStringExtra("streamInfo") ?: ""
                    btnInfo.visibility = if (streamInfoJson.isNotEmpty()) View.VISIBLE else View.GONE
                }
                CMD_UPDATE_SUBTITLE_SIZE -> {
                    currentSubtitleScale = intent.getFloatExtra("subtitleSizeScale", 1.0f)
                    val scale = currentSubtitleScale
                    handler.post { applySubtitleTextSize(scale) }
                }
            }
        }
    }

    private val hideControlsRunnable = Runnable {
        if (controlsVisible) {
            controlsOverlay.animate().alpha(0f).setDuration(300).withEndAction {
                controlsOverlay.visibility = View.GONE
            }.start()
            controlsVisible = false
        }
    }

    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            sendProgressBroadcast(p.currentPosition, p.duration.coerceAtLeast(0L))
            updateTimeUI(p.currentPosition, p.duration.coerceAtLeast(0L))
            handler.postDelayed(this, 5000)
        }
    }

    private val seekBarUpdateRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            val pos = p.currentPosition
            val dur = p.duration.coerceAtLeast(1L)
            val progress = ((pos.toDouble() / dur) * seekBar.max).toInt()
            if (!isUserSeeking) seekBar.progress = progress
            tvCurrentTime.text = formatTime(pos)
            tvTotalTime.text = formatTime(dur)

            // Show/hide Skip Intro button
            if (introStartMs >= 0 && introEndMs >= 0) {
                if (introSkipped && pos < introEndMs) introSkipped = false
                val showSkip = !introSkipped && pos >= introStartMs && pos <= introEndMs + 10_000L
                btnSkipIntro.visibility = if (showSkip) View.VISIBLE else View.GONE
            }

            // Show/hide Next Episode button
            if (nextEpisodeId.isNotEmpty()) {
                val showNext = if (creditsStartMs >= 0L) {
                    // Use credits marker: show from credits start until end
                    dur > 1L && pos >= creditsStartMs
                } else {
                    // Fallback: last 60 seconds
                    dur > 1L && (dur - pos) in 1L..60_000L
                }
                btnNextEpisode.visibility = if (showNext) View.VISIBLE else View.GONE
            }

            // Add chapter markers once we know the duration
            if (!chapterMarkersAdded && chapters.isNotEmpty() && dur > 1L) {
                addChapterMarkers(dur)
                chapterMarkersAdded = true
            }

            handler.postDelayed(this, 500)
        }
    }

    private var isUserSeeking = false
    private var introStartMs = -1L
    private var introEndMs = -1L
    private var introSkipped = false
    private var nextEpisodeId = ""
    private var creditsStartMs = -1L
    private data class Chapter(val name: String, val startMs: Long)
    private var chapters = emptyList<Chapter>()

    // Long-press scrubbing
    private var isScrubbing = false
    private var scrubStartX = 0f
    private var scrubStartPositionMs = 0L
    private val SCRUB_MS_PER_PX = 300L
    private lateinit var tvScrubOverlay: TextView

    // Dolby Vision → HEVC fallback: when the device can't decode DV profile 8,
    // restart with a codec selector that maps video/dolby-vision → video/hevc.
    private var dvFallbackMode = false

    // Video capability fallback: when the hardware decoder reports
    // NO_EXCEEDS_CAPABILITIES (e.g. HEVC Main 10 Level 5.1 on a limited device),
    // for online streams tell Vue to restart with server-side transcoding,
    // for offline files retry with software video decoder.
    private var videoCapFallbackMode = false
    private var forceSoftwareVideo = false

    // Store build parameters so we can rebuild the player for DV fallback.
    private var buildUrl = ""
    private var buildAuthHeader = ""
    private var buildPlayMethod = ""
    private var buildSubtitleTracksJson = "[]"

    // Audio switch fallback — set when user picks a new audio track; cleared on error or after a
    // short window (decoder errors surface within ~1 s; 4 s gives ample margin).
    private var audioSwitchPendingGroupIndex = -1
    private var audioSwitchPendingLanguage = ""
    private val clearAudioSwitchPending = Runnable {
        audioSwitchPendingGroupIndex = -1
        audioSwitchPendingLanguage = ""
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on, extend layout edge-to-edge, then hide system bars.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowInsetsControllerCompat(window, window.decorView).let { ctrl ->
            ctrl.hide(WindowInsetsCompat.Type.systemBars())
            ctrl.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // Keep content outside the display cutout (hole-punch camera).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER
        }

        setContentView(R.layout.activity_native_player)

        playerView = findViewById(R.id.player_view)
        playerView.visibility = View.INVISIBLE  // Hide until playback is ready
        controlsOverlay = findViewById(R.id.controls_overlay)
        btnBack = findViewById(R.id.btn_back)
        btnPlayPause = findViewById(R.id.btn_play_pause)
        btnAudio = findViewById(R.id.btn_audio)
        btnSubtitle = findViewById(R.id.btn_subtitle)
        btnFullscreen = findViewById(R.id.btn_fullscreen)
        seekBar = findViewById(R.id.seek_bar)
        chapterMarkersContainer = findViewById(R.id.chapter_markers)
        tvCurrentTime = findViewById(R.id.tv_current_time)
        tvTotalTime = findViewById(R.id.tv_total_time)
        tvTitle = findViewById(R.id.tv_title)
        btnSkipIntro = findViewById(R.id.btn_skip_intro)
        btnNextEpisode = findViewById(R.id.btn_next_episode)
        tvScrubOverlay = findViewById(R.id.tv_scrub_overlay)
        loadingSpinner = findViewById(R.id.loading_spinner)
        btnQuality = findViewById(R.id.btn_quality)
        btnInfo = findViewById(R.id.btn_info)
        seekFeedbackBack = findViewById(R.id.seek_feedback_back)
        seekFeedbackFwd = findViewById(R.id.seek_feedback_fwd)

        gestureDetector = GestureDetectorCompat(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                if (!isTapOnInteractiveView(e.rawX.toInt(), e.rawY.toInt())) toggleControls()
                return true
            }
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (isTapOnInteractiveView(e.rawX.toInt(), e.rawY.toInt())) return true
                val isForward = e.x > controlsOverlay.width / 2f
                val deltaMs = if (isForward) 10_000L else -10_000L
                player?.let { it.seekTo(maxOf(0L, it.currentPosition + deltaMs)) }
                showSeekFeedback(isForward)
                return true
            }
            override fun onLongPress(e: MotionEvent) {
                if (isTapOnInteractiveView(e.rawX.toInt(), e.rawY.toInt())) return
                isScrubbing = true
                scrubStartX = e.x
                scrubStartPositionMs = player?.currentPosition ?: 0L
                handler.removeCallbacks(hideControlsRunnable)
                controlsOverlay.visibility = View.INVISIBLE
                controlsVisible = false
                showScrubOverlay(scrubStartPositionMs)
            }
        })

        val url = intent.getStringExtra(EXTRA_URL) ?: run {
            finish()
            return
        }
        val authHeader = intent.getStringExtra(EXTRA_AUTH_HEADER) ?: ""
        val startMs = intent.getLongExtra(EXTRA_START_MS, 0L)
        android.util.Log.d("NativePlayer", "NativePlayerActivity.onCreate: url=$url startMs=$startMs")
        val title = intent.getStringExtra(EXTRA_TITLE) ?: ""
        val playMethod = intent.getStringExtra(EXTRA_PLAY_METHOD) ?: "Transcode"
        val subtitleTracksJson = intent.getStringExtra(EXTRA_SUBTITLE_TRACKS) ?: "[]"

        // Quality presets & stream info
        val qualityPresetsJson = intent.getStringExtra(EXTRA_QUALITY_PRESETS) ?: "[]"
        selectedBitrate = intent.getIntExtra(EXTRA_SELECTED_BITRATE, 0)
        streamInfoJson = intent.getStringExtra(EXTRA_STREAM_INFO) ?: ""
        parseQualityPresets(qualityPresetsJson)
        if (qualityPresets.size > 1) btnQuality.visibility = View.VISIBLE
        if (streamInfoJson.isNotEmpty()) btnInfo.visibility = View.VISIBLE

        // Jellyfin audio tracks (used for picker when stream is transcoded)
        parseJellyfinAudioTracks(intent.getStringExtra(EXTRA_AUDIO_TRACKS) ?: "[]")
        selectedJellyfinAudioIndex = intent.getIntExtra(EXTRA_SELECTED_AUDIO_INDEX, -1)
        android.util.Log.d("NativePlayer", "selectedJellyfinAudioIndex=$selectedJellyfinAudioIndex jellyfinAudioTracks=${jellyfinAudioTracks.map { "(${it.first},${it.third})" }}")
        if (jellyfinAudioTracks.size > 1) btnAudio.visibility = View.VISIBLE

        nextEpisodeId = intent.getStringExtra(EXTRA_NEXT_EPISODE_ID) ?: ""
        creditsStartMs = intent.getLongExtra(EXTRA_CREDITS_START_MS, -1L)
        android.util.Log.d("NativePlayer", "nextEpisodeId='$nextEpisodeId' creditsStartMs=$creditsStartMs")

        // Parse chapter markers
        try {
            val chaptersStr = intent.getStringExtra(EXTRA_CHAPTERS_JSON) ?: "[]"
            val arr = org.json.JSONArray(chaptersStr)
            chapters = (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                Chapter(obj.optString("name", ""), obj.optLong("startMs", 0))
            }
        } catch (_: Exception) { chapters = emptyList() }

        tvTitle.text = title

        // Pad the controls overlay to keep all UI outside the display cutout and system bars.
        ViewCompat.setOnApplyWindowInsetsListener(controlsOverlay) { view, windowInsets ->
            val cutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val sysBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(
                maxOf(cutout.left, sysBars.left),
                maxOf(cutout.top, sysBars.top),
                maxOf(cutout.right, sysBars.right),
                maxOf(cutout.bottom, sysBars.bottom)
            )
            windowInsets
        }

        setupControls()
        buildPlayer(url, authHeader, startMs, playMethod, subtitleTracksJson)

        ContextCompat.registerReceiver(
            this,
            commandReceiver,
            IntentFilter(ACTION_COMMAND),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        // Back gesture / button
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                sendStoppedBroadcast()
                finish()
            }
        })
    }

    private fun setupControls() {
        btnBack.setOnClickListener {
            sendStoppedBroadcast()
            finish()
        }

        btnPlayPause.setOnClickListener {
            val p = player ?: return@setOnClickListener
            if (p.isPlaying) {
                p.pause()
                btnPlayPause.setImageResource(R.drawable.ic_play)
            } else {
                p.play()
                btnPlayPause.setImageResource(R.drawable.ic_pause)
            }
            scheduleHideControls()
        }

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    val p = player ?: return
                    val dur = p.duration.coerceAtLeast(1L)
                    tvCurrentTime.text = formatTime((progress.toLong() * dur) / sb.max)
                }
            }

            override fun onStartTrackingTouch(sb: SeekBar) {
                isUserSeeking = true
                handler.removeCallbacks(hideControlsRunnable)
            }

            override fun onStopTrackingTouch(sb: SeekBar) {
                isUserSeeking = false
                val p = player ?: return
                val dur = p.duration.coerceAtLeast(1L)
                val seekMs = (sb.progress.toLong() * dur) / sb.max
                p.seekTo(seekMs)
                scheduleHideControls()
            }
        })

        // Single-tap and double-tap handled via gestureDetector in dispatchTouchEvent

        // Quality picker
        btnQuality.setOnClickListener {
            showQualityPicker()
        }

        // Stream info
        btnInfo.setOnClickListener {
            showStreamInfoDialog()
        }

        // Audio track picker
        btnAudio.setOnClickListener {
            showAudioPicker()
        }

        // Subtitle track picker
        btnSubtitle.setOnClickListener {
            showSubtitlePicker()
        }

        // Fullscreen toggle
        btnFullscreen.setOnClickListener {
            toggleFullscreen()
            scheduleHideControls()
        }

        btnSkipIntro.setOnClickListener {
            val p = player ?: return@setOnClickListener
            introSkipped = true
            btnSkipIntro.visibility = View.GONE
            p.seekTo(introEndMs)
        }

        btnNextEpisode.setOnClickListener {
            sendNextEpisodeBroadcast()
            finish()
        }
    }

    @Suppress("DEPRECATION")
    private fun toggleFullscreen() {
        isFullscreen = !isFullscreen
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        if (isFullscreen) {
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
            insetsController.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            btnFullscreen.setImageResource(R.drawable.ic_fullscreen_exit)
        } else {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
            btnFullscreen.setImageResource(R.drawable.ic_fullscreen)
        }
    }

    private fun buildPlayer(
        url: String,
        authHeader: String,
        startMs: Long,
        playMethod: String,
        subtitleTracksJson: String
    ) {
        // Store params for potential DV fallback rebuild
        buildUrl = url
        buildAuthHeader = authHeader
        buildPlayMethod = playMethod
        buildSubtitleTracksJson = subtitleTracksJson

        val httpFactory = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(mapOf("Authorization" to authHeader))
        val dataFactory = DefaultDataSource.Factory(this, httpFactory)

        val audioAttr = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        // Parse subtitle configurations from JSON
        val subtitleConfigs = parseSubtitleConfigs(subtitleTracksJson)
        sidecarSubtitleCount = subtitleConfigs.size
        sidecarSubtitles.clear()
        subtitleConfigs.forEach { cfg ->
            sidecarSubtitles.add(Pair(cfg.label?.toString() ?: (cfg.language?.toString() ?: "und"), cfg.language?.toString() ?: "und"))
        }

        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .setSubtitleConfigurations(subtitleConfigs)
            .build()

        // Use DefaultMediaSourceFactory instead of raw HlsMediaSource.Factory /
        // ProgressiveMediaSource.Factory.  DefaultMediaSourceFactory:
        //   1. auto-detects HLS (.m3u8) vs Progressive from the URI
        //   2. processes SubtitleConfigurations — creates SingleSampleMediaSources
        //      with the new subtitle-parsing pipeline (text/vtt → x-media3-cues)
        //   3. merges sidecar subtitle sources via MergingMediaSource
        // Raw child factories ignore SubtitleConfigurations entirely and the new
        // Media3 1.5 text renderer rejects raw text/vtt samples.
        @Suppress("DEPRECATION")
        val defaultFactory = DefaultMediaSourceFactory(dataFactory)

        // Prefer FFmpeg audio decoder over platform MediaCodec. The platform
        // renderer claims EAC3 support based on MIME type but fails on Dolby
        // Atmos (JOC) profiles at decode time. PREFER mode lets FFmpeg handle
        // all audio — CPU cost for audio software decoding is negligible.
        val renderersFactory = androidx.media3.exoplayer.DefaultRenderersFactory(this)
            .setExtensionRendererMode(
                androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
            )

        // When hardware video decoder fails (e.g. HEVC Main 10 on limited hardware),
        // use the FFmpeg software video renderer if its native lib supports the codec.
        // This is triggered on the second attempt (forceSoftwareVideo=true) after the
        // first attempt fails with NO_EXCEEDS_CAPABILITIES.
        val ffmpegVideoAvailable = forceSoftwareVideo &&
            androidx.media3.decoder.ffmpeg.FfmpegLibrary.isAvailable() &&
            (androidx.media3.decoder.ffmpeg.FfmpegLibrary.supportsFormat("video/hevc") ||
             androidx.media3.decoder.ffmpeg.FfmpegLibrary.supportsFormat("video/avc"))

        val exo = if (ffmpegVideoAvailable) {
            debugLog("[SWVideo] FFmpeg video renderer available — using custom renderer factory")
            // Make PlayerView shutter transparent so Canvas-rendered frames are visible
            // (PlayerView keeps a black shutter until its standard renderer reports first frame,
            // but our custom renderer draws via Canvas directly to the Surface).
            playerView.setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
            val ffmpegVideoRenderer = androidx.media3.decoder.ffmpeg.FfmpegVideoRenderer(
                /* allowedJoiningTimeMs= */ 5000L,
                /* eventHandler= */ null,
                /* eventListener= */ null,
                /* maxDroppedFramesToNotify= */ 50
            )
            // Wrap DefaultRenderersFactory, prepending FFmpegVideoRenderer so ExoPlayer
            // tries it before the MediaCodec renderers.
            val wrappedFactory = androidx.media3.exoplayer.RenderersFactory { eventHandler,
                videoListener, audioListener, textOutput, metadataOutput ->
                val base = renderersFactory.createRenderers(
                    eventHandler, videoListener, audioListener, textOutput, metadataOutput)
                arrayOf(ffmpegVideoRenderer, *base)
            }
            ExoPlayer.Builder(this, wrappedFactory)
                .setMediaSourceFactory(defaultFactory)
                .setAudioAttributes(audioAttr, true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build()
        } else {
            if (forceSoftwareVideo) {
                debugLog("[SWVideo] FFmpeg video not available — MediaCodec software fallback")
                renderersFactory.setMediaCodecSelector { mimeType, requiresSecureDecoder, requiresTunnelingDecoder ->
                    val all = androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT
                        .getDecoderInfos(mimeType, requiresSecureDecoder, requiresTunnelingDecoder)
                    if (mimeType.startsWith("video/")) {
                        val sw = all.filter { it.softwareOnly }
                        debugLog("[SWVideo] $mimeType: ${all.size} total, ${sw.size} software: ${sw.map { it.name }}")
                        sw.toMutableList()
                    } else all
                }
            }
            ExoPlayer.Builder(this, renderersFactory)
                .setMediaSourceFactory(defaultFactory)
                .setAudioAttributes(audioAttr, true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build()
        }

        android.util.Log.d("NativePlayer", "buildPlayer: startMs=$startMs playMethod=$playMethod isHls=${url.contains(".m3u8")} sidecarSubs=${subtitleConfigs.size}")

        if (startMs > 0) {
            exo.setMediaItem(mediaItem, startMs)
            android.util.Log.d("NativePlayer", "buildPlayer setMediaItem with startMs=$startMs")
        } else {
            exo.setMediaItem(mediaItem)
            android.util.Log.d("NativePlayer", "buildPlayer setMediaItem from beginning")
        }
        exo.prepare()
        exo.playWhenReady = true
        // Use exact seeking so the decoder always renders a frame at the target position.
        // Default CLOSEST_SYNC can leave a stale frame on hardware decoders (progressive files).
        exo.setSeekParameters(SeekParameters.EXACT)

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                val stateName = when (state) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> "READY"
                    Player.STATE_ENDED -> "ENDED"
                    else -> "UNKNOWN($state)"
                }
                android.util.Log.d("NativePlayer", "onPlaybackStateChanged: $stateName pos=${exo.currentPosition}ms dur=${exo.duration}ms")
                when (state) {
                    Player.STATE_READY -> {
                        playerView.visibility = View.VISIBLE
                        loadingSpinner.visibility = View.GONE
                        if (!tracksReported) {
                            tracksReported = true
                            reportTracks(exo)
                        }
                        handler.post(seekBarUpdateRunnable)
                        handler.post(progressRunnable)
                    }
                    Player.STATE_ENDED -> {
                        loadingSpinner.visibility = View.GONE
                        handler.removeCallbacks(progressRunnable)
                        handler.removeCallbacks(seekBarUpdateRunnable)
                        sendProgressBroadcast(exo.duration.coerceAtLeast(0L), exo.duration.coerceAtLeast(0L))
                        sendEndedBroadcast()
                    }
                    Player.STATE_BUFFERING -> { loadingSpinner.visibility = View.VISIBLE }
                    Player.STATE_IDLE -> { /* idle */ }
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                btnPlayPause.setImageResource(if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play)
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                debugLog("[AudioCrash] onPlayerError: code=${error.errorCode} msg=${error.message}")
                debugLog("[AudioCrash]   pendingIdx=$audioSwitchPendingGroupIndex pendingLang=$audioSwitchPendingLanguage selectedAudioGroupIndex=$selectedAudioGroupIndex")
                debugLog("[AudioCrash]   isAudioPlaybackError=${isAudioPlaybackError(error)}")
                var c: Throwable? = error.cause
                var depth = 0
                while (c != null) {
                    debugLog("[AudioCrash]   cause[$depth]: ${c.javaClass.name}: ${c.message}")
                    c = c.cause; depth++
                }
                // Dolby Vision video decode failure → tell Vue to restart with
                // server-side transcoding (online) or show error (offline).
                // The device's HEVC decoder can't handle DV Profile 8 NAL units.
                if (!dvFallbackMode && isDolbyVisionVideoError(error)) {
                    dvFallbackMode = true
                    val resumeMs = player?.currentPosition ?: 0L
                    debugLog("[DVFallback] DV video decode failed, notifying Vue to transcode (resumeMs=$resumeMs)")
                    stoppedSent = true // prevent the generic stopped broadcast
                    val intent = Intent(ACTION_VIDEO_ERROR)
                    intent.putExtra("reason", "dolby_vision_unsupported")
                    intent.putExtra("positionMs", resumeMs)
                    intent.setPackage(packageName)
                    sendBroadcast(intent)
                    finish()
                    return
                }

                // Hardware decoder reports NO_EXCEEDS_CAPABILITIES (e.g. HEVC Main 10
                // Level 5.1 on a device that only supports up to Level 4.1 or 8-bit).
                // Tell Vue to restart with server-side video transcoding.
                debugLog("[VideoFallback] isVideoCapabilityExceededError=${isVideoCapabilityExceededError(error)} isDolbyVision=${isDolbyVisionVideoError(error)}")
                if (!videoCapFallbackMode && isVideoCapabilityExceededError(error)) {
                    videoCapFallbackMode = true
                    val resumeMs = player?.currentPosition ?: 0L

                    // Offline files: retry with software video decoder before giving up
                    val isOffline = buildUrl.startsWith("file://") || buildUrl.startsWith("content://")
                    if (isOffline && !forceSoftwareVideo) {
                        debugLog("[VideoFallback] Offline file — retrying with software video decoder (resumeMs=$resumeMs)")
                        forceSoftwareVideo = true
                        tracksReported = false
                        player?.release()
                        player = null
                        buildPlayer(buildUrl, buildAuthHeader, resumeMs, buildPlayMethod, buildSubtitleTracksJson)
                        return
                    }

                    // Online or software decoder also failed → tell Vue
                    debugLog("[VideoFallback] Video codec exceeds device capabilities, notifying Vue to transcode (resumeMs=$resumeMs)")
                    stoppedSent = true
                    val intent = Intent(ACTION_VIDEO_ERROR)
                    intent.putExtra("reason", "video_codec_unsupported")
                    intent.putExtra("positionMs", resumeMs)
                    intent.setPackage(packageName)
                    sendBroadcast(intent)
                    finish()
                    return
                }

                handler.removeCallbacks(clearAudioSwitchPending)
                val pendingIdx = audioSwitchPendingGroupIndex
                val pendingLang = audioSwitchPendingLanguage
                audioSwitchPendingGroupIndex = -1
                audioSwitchPendingLanguage = ""
                when {
                    pendingIdx >= 0 -> {
                        debugLog("[AudioCrash] → branch: pendingSwitch (idx=$pendingIdx lang=$pendingLang)")
                        sendAudioErrorBroadcast(pendingIdx, pendingLang)
                    }
                    selectedAudioGroupIndex >= 0 && isAudioPlaybackError(error) -> {
                        val group = audioTrackGroups.firstOrNull { it.first == selectedAudioGroupIndex }
                        val language = group?.second?.getFormat(0)?.language ?: "und"
                        debugLog("[AudioCrash] → branch: autoSelected (selectedIdx=$selectedAudioGroupIndex lang=$language)")
                        sendAudioErrorBroadcast(selectedAudioGroupIndex, language)
                    }
                    isAudioPlaybackError(error) -> {
                        // Audio decoder crash before reportTracks (e.g. single eac3+Atmos track).
                        // Send groupIndex=-1 so Vue falls back to the default audio stream.
                        debugLog("[AudioCrash] → branch: earlyAudioError (tracks not yet reported)")
                        sendAudioErrorBroadcast(-1, "und")
                    }
                    else -> {
                        debugLog("[AudioCrash] → branch: genericError (no audio fallback)")
                        sendErrorBroadcast(error.message ?: "Playback error")
                    }
                }
            }
        })

        playerView.player = exo
        player = exo

        // Create MediaSession for system media controls (lock screen, notification, Bluetooth)
        mediaSession?.release()
        mediaSession = MediaSession.Builder(this, exo).build()

        // Remove the black background box behind subtitles; keep white text with a
        // dark outline so they remain readable on any content.
        playerView.subtitleView?.setStyle(
            androidx.media3.ui.CaptionStyleCompat(
                android.graphics.Color.WHITE,
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
                androidx.media3.ui.CaptionStyleCompat.EDGE_TYPE_OUTLINE,
                android.graphics.Color.BLACK,
                null
            )
        )
        // Apply user subtitle size preference — defer until view is laid out so width/height are known
        currentSubtitleScale = intent.getFloatExtra(EXTRA_SUBTITLE_TEXT_SIZE, 1.0f)
        val initialScale = currentSubtitleScale
        playerView.subtitleView?.addOnLayoutChangeListener(object : View.OnLayoutChangeListener {
            override fun onLayoutChange(v: View, l: Int, t: Int, r: Int, b: Int, ol: Int, ot: Int, or2: Int, ob: Int) {
                v.removeOnLayoutChangeListener(this)
                applySubtitleTextSize(initialScale)
            }
        })

        scheduleHideControls()
        setupMediaNotification()
    }

    private fun setupMediaNotification() {
        val exo = player ?: return

        // Create notification channel (no-op if already exists)
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Media Playback",
                NotificationManager.IMPORTANCE_LOW
            )
        )

        // MediaSession links ExoPlayer to the system (lock screen, BT controls, etc.)
        mediaSession = MediaSession.Builder(this, exo).build()

        // PlayerNotificationManager shows a media notification with play/pause/seek controls
        playerNotificationManager = PlayerNotificationManager.Builder(this, NOTIFICATION_ID, NOTIFICATION_CHANNEL_ID)
            .setMediaDescriptionAdapter(object : PlayerNotificationManager.MediaDescriptionAdapter {
                override fun getCurrentContentTitle(player: Player): CharSequence =
                    tvTitle.text
                override fun createCurrentContentIntent(player: Player) = null
                override fun getCurrentContentText(player: Player): CharSequence? = null
                override fun getCurrentLargeIcon(
                    player: Player,
                    callback: PlayerNotificationManager.BitmapCallback
                ) = null
            })
            .setSmallIconResourceId(android.R.drawable.ic_media_play)
            .build()
            .also { mgr ->
                mgr.setMediaSessionToken(mediaSession!!.sessionCompatToken)
                mgr.setPlayer(exo)
            }
    }

    private fun applySubtitleTextSize(scale: Float) {
        // Scale the SubtitleView directly — bypasses cue-level text size overrides
        // (setFractionalTextSize/setFixedTextSize are ignored when cues embed their own size)
        playerView.subtitleView?.let { view ->
            view.scaleX = scale
            view.scaleY = scale
            // Anchor scaling to the bottom-center so subtitles grow upward, not off-screen
            view.pivotX = view.width / 2f
            view.pivotY = view.height.toFloat()
        }
    }

    private fun parseSubtitleConfigs(json: String): List<MediaItem.SubtitleConfiguration> {
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.getJSONObject(i)
                val url = obj.optString("url").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val lang = obj.optString("lang", "und")
                val label = obj.optString("label", lang)
                MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(url))
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(lang)
                    .setLabel(label)
                    .build()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun reportTracks(exo: ExoPlayer) {
        val tracks = exo.currentTracks
        val audioArr = JSONArray()
        val subtitleArr = JSONArray()

        audioTrackGroups.clear()
        subtitleTrackGroups.clear()

        for (groupIndex in 0 until tracks.groups.size) {
            val group = tracks.groups[groupIndex]
            val trackGroup = group.mediaTrackGroup
            val type = group.type
            if (type == C.TRACK_TYPE_AUDIO) {
                val obj = JSONObject()
                val format = trackGroup.getFormat(0)
                obj.put("groupIndex", groupIndex)
                obj.put("language", format.language ?: "und")
                obj.put("label", format.label ?: (format.language ?: "und"))
                obj.put("channelCount", format.channelCount)
                obj.put("codec", format.codecs ?: "")
                audioArr.put(obj)
                audioTrackGroups.add(Pair(groupIndex, trackGroup))
                if (group.isSelected) {
                    selectedAudioGroupIndex = groupIndex
                    debugLog("[AudioCrash] reportTracks: auto-selected audio groupIndex=$groupIndex lang=${format.language} codec=${format.codecs}")
                }
            } else if (type == C.TRACK_TYPE_TEXT) {
                val obj = JSONObject()
                val format = trackGroup.getFormat(0)
                obj.put("groupIndex", groupIndex)
                obj.put("language", format.language ?: "und")
                obj.put("label", format.label ?: (format.language ?: "und"))
                subtitleArr.put(obj)
                subtitleTrackGroups.add(Pair(groupIndex, trackGroup))
            }
        }

        // Show/hide buttons based on track availability
        if (audioTrackGroups.size > 1 || jellyfinAudioTracks.size > 1) btnAudio.visibility = View.VISIBLE
        if (subtitleTrackGroups.isNotEmpty() || sidecarSubtitleCount > 0) btnSubtitle.visibility = View.VISIBLE

        android.util.Log.d("NativePlayer", "[Subtitles] reportTracks: ${audioTrackGroups.size} audio, ${subtitleTrackGroups.size} subtitle")
        subtitleTrackGroups.forEach { (idx, group) ->
            val f = group.getFormat(0)
            android.util.Log.d("NativePlayer", "[Subtitles]   groupIndex=$idx lang=${f.language} label=${f.label}")
        }

        val result = JSONObject()
        result.put("audioTracks", audioArr)
        result.put("subtitleTracks", subtitleArr)

        val broadcastIntent = Intent(ACTION_TRACKS)
        broadcastIntent.putExtra("tracks", result.toString())
        broadcastIntent.setPackage(packageName)
        sendBroadcast(broadcastIntent)
    }

    private fun selectAudioTrack(groupIndex: Int) {
        val p = player ?: return
        val group = audioTrackGroups.firstOrNull { it.first == groupIndex } ?: return
        val language = group.second.getFormat(0).language ?: "und"

        // Mark pending — onPlayerError will check this if the decoder fails on the new track.
        // Auto-cleared after 4 s (success path); cancelled and handled immediately on error.
        debugLog("[AudioCrash] selectAudioTrack: groupIndex=$groupIndex lang=$language codec=${group.second.getFormat(0).codecs}")
        handler.removeCallbacks(clearAudioSwitchPending)
        audioSwitchPendingGroupIndex = groupIndex
        audioSwitchPendingLanguage = language
        handler.postDelayed(clearAudioSwitchPending, 4000)

        p.trackSelectionParameters = p.trackSelectionParameters
            .buildUpon()
            .setOverrideForType(TrackSelectionOverride(group.second, 0))
            .build()
        selectedAudioGroupIndex = groupIndex

        val broadcastIntent = Intent(ACTION_AUDIO_SELECTED)
        broadcastIntent.putExtra("language", language)
        broadcastIntent.putExtra("groupIndex", groupIndex)
        broadcastIntent.setPackage(packageName)
        sendBroadcast(broadcastIntent)

        // Show selected state on button when a non-default track is active
        val isDefault = audioTrackGroups.firstOrNull()?.first == groupIndex
        btnAudio.setBackgroundResource(
            if (isDefault) R.drawable.bg_player_button else R.drawable.bg_player_button_selected
        )
    }

    private fun selectSubtitleTrack(groupIndex: Int) {
        val p = player ?: return
        if (groupIndex < 0) {
            p.trackSelectionParameters = p.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
            selectedSubtitleGroupIndex = -1

            val broadcastIntent = Intent(ACTION_SUBTITLE_SELECTED)
            broadcastIntent.putExtra("groupIndex", -1)
            broadcastIntent.putExtra("label", "")
            broadcastIntent.setPackage(packageName)
            sendBroadcast(broadcastIntent)
            btnSubtitle.setBackgroundResource(R.drawable.bg_player_button)
        } else {
            val group = subtitleTrackGroups.firstOrNull { it.first == groupIndex } ?: return
            p.trackSelectionParameters = p.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setOverrideForType(TrackSelectionOverride(group.second, 0))
                .build()
            selectedSubtitleGroupIndex = groupIndex

            val format = group.second.getFormat(0)
            val label = format.label ?: (format.language ?: "und")
            android.util.Log.d("NativePlayer", "[Subtitles] selectSubtitleTrack: groupIndex=$groupIndex label=$label")
            val broadcastIntent = Intent(ACTION_SUBTITLE_SELECTED)
            broadcastIntent.putExtra("groupIndex", groupIndex)
            // Use same fallback as reportTracks so save and restore labels always match.
            broadcastIntent.putExtra("label", label)
            broadcastIntent.setPackage(packageName)
            sendBroadcast(broadcastIntent)
            btnSubtitle.setBackgroundResource(R.drawable.bg_player_button_selected)
        }
    }

    /** Normalize a language code to ISO 639-1 (2-letter) for comparison.
     *  Handles ISO 639-2/T ("fra"), ISO 639-2/B ("fre"), and BCP 47 ("fr"). */
    private fun normalizeLang(code: String): String {
        if (code.isBlank() || code == "und") return code
        if (code.length == 2) return code.lowercase()
        // 3-letter → 2-letter: find a Locale whose ISO 639-2 code matches
        val lower = code.lowercase()
        return java.util.Locale.getAvailableLocales()
            .firstOrNull { it.language.length == 2 && it.getISO3Language() == lower }
            ?.language?.lowercase()
            ?: lower
    }

    private fun showAudioPicker() {
        // If ExoPlayer has multiple tracks (DirectPlay), use them directly.
        // Otherwise fall back to the Jellyfin track list and trigger a Vue-side restart.
        if (audioTrackGroups.size > 1) {
            val labels = audioTrackGroups.map { (_, group) ->
                val format = group.getFormat(0)
                "${format.language ?: "und"} ${if (format.channelCount > 0) "(${format.channelCount}ch)" else ""} ${if (!format.codecs.isNullOrEmpty()) "- ${format.codecs!!.uppercase()}" else ""}".trim()
            }.toTypedArray()
            val checkedItem = audioTrackGroups.indexOfFirst { it.first == selectedAudioGroupIndex }
            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Audio Track")
                .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                    selectAudioTrack(audioTrackGroups[which].first)
                    dialog.dismiss()
                }
                .setNegativeButton("Cancel", null)
                .show()
        } else if (jellyfinAudioTracks.isNotEmpty()) {
            val labels = jellyfinAudioTracks.map { it.second }.toTypedArray()
            // Use the Jellyfin audio index that was requested for this session.
            // Language matching is unreliable here because the transcoded stream
            // has only one ExoPlayer track whose language may not match.
            val checkedItem = jellyfinAudioTracks.indexOfFirst { it.first == selectedJellyfinAudioIndex }
            android.util.Log.d("NativePlayer", "showAudioPicker: jellyfin branch, selectedJellyfinAudioIndex=$selectedJellyfinAudioIndex checkedItem=$checkedItem")
            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Audio Track")
                .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                    val (jellyfinIndex, _, _) = jellyfinAudioTracks[which]
                    selectedJellyfinAudioIndex = jellyfinIndex
                    dialog.dismiss()
                    val broadcastIntent = Intent(ACTION_AUDIO_SWITCH_JELLYFIN)
                    broadcastIntent.putExtra("jellyfinIndex", jellyfinIndex)
                    broadcastIntent.setPackage(packageName)
                    sendBroadcast(broadcastIntent)
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun parseJellyfinAudioTracks(json: String) {
        jellyfinAudioTracks.clear()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                jellyfinAudioTracks.add(Triple(
                    obj.getInt("index"),
                    obj.getString("label"),
                    obj.optString("language", "und")
                ))
            }
        } catch (e: Exception) {
            android.util.Log.e("NativePlayer", "parseJellyfinAudioTracks error", e)
        }
    }

    private fun showSubtitlePicker() {
        if (subtitleTrackGroups.isEmpty() && sidecarSubtitles.isEmpty()) return

        if (subtitleTrackGroups.isNotEmpty()) {
            // ExoPlayer has track groups — use them directly
            val labels = buildList {
                add("Off")
                addAll(subtitleTrackGroups.map { (_, group) ->
                    val format = group.getFormat(0)
                    format.label ?: (format.language ?: "und")
                })
            }.toTypedArray()
            val checkedItem = if (selectedSubtitleGroupIndex < 0) 0
                else (subtitleTrackGroups.indexOfFirst { it.first == selectedSubtitleGroupIndex } + 1)

            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Subtitles")
                .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                    if (which == 0) {
                        selectSubtitleTrack(-1)
                    } else {
                        selectSubtitleTrack(subtitleTrackGroups[which - 1].first)
                    }
                    dialog.dismiss()
                }
                .setNeutralButton("Size: ${Math.round(currentSubtitleScale * 100)}%") { _, _ ->
                    showSubtitleSizePicker()
                }
                .setNegativeButton("Cancel", null)
                .show()
        } else {
            // Transcoded stream: ExoPlayer didn't report text tracks.
            // Show sidecar labels and broadcast selection to Vue for server-side burn-in.
            val labels = buildList {
                add("Off")
                addAll(sidecarSubtitles.map { it.first })
            }.toTypedArray()
            val checkedItem = 0 // default to Off for now

            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Subtitles")
                .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                    if (which == 0) {
                        selectSubtitleTrack(-1)
                    } else {
                        // Broadcast the sidecar subtitle selection to Vue
                        val sub = sidecarSubtitles[which - 1]
                        val broadcastIntent = Intent(ACTION_SUBTITLE_SELECTED)
                        broadcastIntent.putExtra("groupIndex", which - 1)
                        broadcastIntent.putExtra("label", sub.first)
                        broadcastIntent.setPackage(packageName)
                        sendBroadcast(broadcastIntent)
                        selectedSubtitleGroupIndex = which - 1
                        btnSubtitle.setBackgroundResource(R.drawable.bg_player_button_selected)
                    }
                    dialog.dismiss()
                }
                .setNeutralButton("Size: ${Math.round(currentSubtitleScale * 100)}%") { _, _ ->
                    showSubtitleSizePicker()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun showSubtitleSizePicker() {
        val steps = floatArrayOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
        val labels = steps.map { "${Math.round(it * 100)}%" }.toTypedArray()
        val checkedItem = steps.indexOfFirst { it == currentSubtitleScale }.takeIf { it >= 0 } ?: 2

        androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
            .setTitle("Subtitle size")
            .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                currentSubtitleScale = steps[which]
                val newScale = currentSubtitleScale
                dialog.dismiss()
                // Apply after dialog fully dismisses and window regains focus
                handler.post { applySubtitleTextSize(newScale) }
                // Notify Vue so preferencesStore stays in sync
                val notify = Intent(ACTION_SUBTITLE_SIZE_CHANGED)
                notify.putExtra("scale", newScale)
                notify.setPackage(packageName)
                sendBroadcast(notify)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun parseQualityPresets(json: String) {
        qualityPresets.clear()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                qualityPresets.add(Pair(obj.getInt("bitrate"), obj.getString("label")))
            }
        } catch (e: Exception) {
            android.util.Log.e("NativePlayer", "parseQualityPresets error", e)
        }
    }

    private fun showQualityPicker() {
        if (qualityPresets.isEmpty()) return
        val labels = qualityPresets.map { it.second }.toTypedArray()
        val checkedItem = qualityPresets.indexOfFirst { it.first == selectedBitrate }

        androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
            .setTitle("Quality")
            .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                val bitrate = qualityPresets[which].first
                selectedBitrate = bitrate
                dialog.dismiss()
                // Broadcast back to Vue so it can do the actual quality switch
                val broadcastIntent = Intent(ACTION_QUALITY_SELECTED)
                broadcastIntent.putExtra("bitrate", bitrate)
                broadcastIntent.setPackage(packageName)
                sendBroadcast(broadcastIntent)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showStreamInfoDialog() {
        if (streamInfoJson.isEmpty()) return
        try {
            val info = JSONObject(streamInfoJson)
            val sb = StringBuilder()

            val method = info.optString("playMethod", "")
            if (method.isNotEmpty()) sb.append("Play Method: $method\n")

            val reason = info.optString("transcodeReason", "")
            if (reason.isNotEmpty()) sb.append("Reason: $reason\n")

            // Video
            val vCodec = info.optString("videoCodec", "")
            val vRes = info.optString("resolution", "")
            val vBitrate = info.optInt("videoBitrate", 0)
            val vDirect = info.optBoolean("isVideoDirect", true)
            if (vCodec.isNotEmpty() || vRes.isNotEmpty()) {
                sb.append("\n— Video —\n")
                if (vRes.isNotEmpty()) sb.append("Resolution: $vRes\n")
                if (vCodec.isNotEmpty()) sb.append("Codec: ${vCodec.uppercase()}${if (!vDirect) " (transcoding)" else " (copy)"}\n")
                if (vBitrate > 0) sb.append("Bitrate: ${vBitrate / 1000} kbps\n")
            }

            val fps = info.optDouble("framerate", 0.0)
            if (fps > 0) sb.append("Frame rate: ${"%.1f".format(fps)} fps\n")

            // Audio
            val aCodec = info.optString("audioCodec", "")
            val aChannels = info.optString("audioChannels", "")
            val aBitrate = info.optInt("audioBitrate", 0)
            val aDirect = info.optBoolean("isAudioDirect", true)
            if (aCodec.isNotEmpty() || aChannels.isNotEmpty()) {
                sb.append("\n— Audio —\n")
                if (aCodec.isNotEmpty()) sb.append("Codec: ${aCodec.uppercase()}${if (!aDirect) " (transcoding)" else " (copy)"}\n")
                if (aChannels.isNotEmpty()) sb.append("Channels: $aChannels\n")
                if (aBitrate > 0) sb.append("Bitrate: ${aBitrate / 1000} kbps\n")
            }

            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Stream Info")
                .setMessage(sb.toString().trimEnd())
                .setPositiveButton("OK", null)
                .show()
        } catch (e: Exception) {
            android.util.Log.e("NativePlayer", "showStreamInfoDialog error", e)
        }
    }

    private fun toggleControls() {
        if (controlsVisible) {
            handler.removeCallbacks(hideControlsRunnable)
            controlsOverlay.animate().alpha(0f).setDuration(300).withEndAction {
                controlsOverlay.visibility = View.GONE
            }.start()
            controlsVisible = false
        } else {
            controlsOverlay.visibility = View.VISIBLE
            controlsOverlay.animate().alpha(1f).setDuration(300).start()
            controlsVisible = true
            scheduleHideControls()
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (ev != null) {
            gestureDetector.onTouchEvent(ev)
            when (ev.action) {
                MotionEvent.ACTION_MOVE -> {
                    if (isScrubbing) {
                        val deltaX = ev.x - scrubStartX
                        val dur = player?.duration?.coerceAtLeast(0L) ?: 0L
                        val newPos = (scrubStartPositionMs + deltaX * SCRUB_MS_PER_PX)
                            .toLong().coerceIn(0L, dur)
                        player?.seekTo(newPos)
                        updateScrubOverlay(newPos)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isScrubbing) {
                        isScrubbing = false
                        hideScrubOverlay()
                        controlsOverlay.visibility = View.VISIBLE
                        controlsOverlay.alpha = 1f
                        controlsVisible = true
                        scheduleHideControls()
                    }
                }
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    /** Returns true if the touch coordinates land on one of the interactive control buttons. */
    private fun isTapOnInteractiveView(x: Int, y: Int): Boolean {
        val views = listOf(btnBack, btnPlayPause, btnAudio, btnSubtitle, btnFullscreen, btnQuality, btnInfo, seekBar, btnSkipIntro, btnNextEpisode)
        val loc = IntArray(2)
        for (v in views) {
            if (!v.isShown) continue
            v.getLocationOnScreen(loc)
            if (x >= loc[0] && x <= loc[0] + v.width && y >= loc[1] && y <= loc[1] + v.height) return true
        }
        return false
    }

    private fun showSeekFeedback(isForward: Boolean) {
        val show = if (isForward) seekFeedbackFwd else seekFeedbackBack
        val hide = if (isForward) seekFeedbackBack else seekFeedbackFwd
        hide.visibility = View.INVISIBLE
        hide.clearAnimation()
        show.alpha = 1f
        show.visibility = View.VISIBLE
        show.animate().setStartDelay(400).alpha(0f).setDuration(300).withEndAction {
            show.visibility = View.INVISIBLE
        }.start()
    }

    private fun showScrubOverlay(posMs: Long) {
        tvScrubOverlay.text = formatTime(posMs)
        tvScrubOverlay.visibility = View.VISIBLE
    }

    private fun updateScrubOverlay(posMs: Long) {
        tvScrubOverlay.text = formatTime(posMs)
    }

    private fun hideScrubOverlay() {
        tvScrubOverlay.visibility = View.GONE
    }

    private fun scheduleHideControls() {
        handler.removeCallbacks(hideControlsRunnable)
        handler.postDelayed(hideControlsRunnable, 3000)
    }

    private fun updateTimeUI(posMs: Long, durMs: Long) {
        tvCurrentTime.text = formatTime(posMs)
        tvTotalTime.text = formatTime(durMs)
        if (!isUserSeeking && durMs > 0) {
            seekBar.progress = ((posMs.toDouble() / durMs) * seekBar.max).toInt()
        }
    }

    private fun addChapterMarkers(durationMs: Long) {
        chapterMarkersContainer.removeAllViews()
        val thumbPaddingPx = (16 * resources.displayMetrics.density).toInt() // match SeekBar thumb padding
        for (ch in chapters) {
            if (ch.startMs <= 0 || ch.startMs >= durationMs) continue
            val fraction = ch.startMs.toFloat() / durationMs
            val marker = View(this).apply {
                setBackgroundColor(0xCCFFFFFF.toInt()) // white with slight transparency
                layoutParams = FrameLayout.LayoutParams(
                    (2 * resources.displayMetrics.density).toInt(), // 2dp wide
                    (10 * resources.displayMetrics.density).toInt() // 10dp tall
                ).apply {
                    gravity = android.view.Gravity.CENTER_VERTICAL
                }
            }
            chapterMarkersContainer.addView(marker)
            // Position marker after layout
            marker.post {
                val trackWidth = chapterMarkersContainer.width - 2 * thumbPaddingPx
                val x = thumbPaddingPx + (fraction * trackWidth).toInt() - marker.width / 2
                marker.translationX = x.toFloat()
            }
        }
    }

    private fun formatTime(ms: Long): String {
        val totalSec = (ms / 1000).coerceAtLeast(0L)
        val hours = totalSec / 3600
        val minutes = (totalSec % 3600) / 60
        val seconds = totalSec % 60
        return if (hours > 0) {
            "%d:%02d:%02d".format(hours, minutes, seconds)
        } else {
            "%d:%02d".format(minutes, seconds)
        }
    }

    // ── Broadcast helpers ──────────────────────────────────────────────────────

    private fun sendProgressBroadcast(posMs: Long, durMs: Long) {
        android.util.Log.d("NativePlayer", "progress: posMs=$posMs durMs=$durMs")
        val intent = Intent(ACTION_PROGRESS)
        intent.putExtra("positionMs", posMs)
        intent.putExtra("durationMs", durMs)
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    private fun sendEndedBroadcast() {
        sendBroadcast(Intent(ACTION_ENDED).also { it.setPackage(packageName) })
    }

    private fun sendAudioErrorBroadcast(groupIndex: Int, language: String) {
        val intent = Intent(ACTION_AUDIO_ERROR)
        intent.putExtra("groupIndex", groupIndex)
        intent.putExtra("language", language)
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    /** Log to both logcat and Vue (via broadcast) for in-app log viewer. */
    private fun debugLog(msg: String) {
        android.util.Log.d("NativePlayer", msg)
        val intent = Intent(ACTION_DEBUG_LOG)
        intent.putExtra("message", msg)
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    /** Returns true when the error is a Dolby Vision video decode failure (e.g. DV Profile 8
     *  on a device without DV support — the HEVC base layer can still be decoded). */
    private fun isDolbyVisionVideoError(error: androidx.media3.common.PlaybackException): Boolean {
        val msg = buildString {
            append(error.message ?: "")
            var c: Throwable? = error.cause
            while (c != null) { append(' ').append(c.message ?: ""); c = c.cause }
        }
        return (msg.contains("VideoRenderer", ignoreCase = true) ||
                msg.contains("VideoDecoder", ignoreCase = true) ||
                msg.contains("MediaCodecVideoRenderer", ignoreCase = true) ||
                msg.contains("MediaCodecVideoDecoder", ignoreCase = true)) &&
               (msg.contains("dolby-vision", ignoreCase = true) ||
                msg.contains("dolby_vision", ignoreCase = true) ||
                msg.contains("dvhe", ignoreCase = true))
    }

    /** Returns true when the hardware video decoder rejects the stream because the
     *  codec profile/level exceeds its capabilities (NO_EXCEEDS_CAPABILITIES). */
    private fun isVideoCapabilityExceededError(error: androidx.media3.common.PlaybackException): Boolean {
        val msg = buildString {
            append(error.message ?: "")
            var c: Throwable? = error.cause
            while (c != null) { append(' ').append(c.message ?: ""); c = c.cause }
        }
        return (msg.contains("VideoRenderer", ignoreCase = true) ||
                msg.contains("VideoDecoder", ignoreCase = true) ||
                msg.contains("MediaCodecVideoRenderer", ignoreCase = true)) &&
               msg.contains("NO_EXCEEDS_CAPABILITIES", ignoreCase = true)
    }

    /** Returns true when the error is identifiable as an audio renderer/sink failure. */
    private fun isAudioPlaybackError(error: androidx.media3.common.PlaybackException): Boolean {
        // Definitive audio-track error codes
        if (error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED ||
            error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED ||
            error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_AUDIO_TRACK_OFFLOAD_INIT_FAILED) {
            return true
        }
        // Walk the cause chain looking for audio renderer class/message fingerprints
        val msg = buildString {
            append(error.message ?: "")
            var c: Throwable? = error.cause
            while (c != null) { append(' ').append(c.message ?: ""); c = c.cause }
        }
        return msg.contains("AudioRenderer", ignoreCase = true) ||
               msg.contains("AudioSink", ignoreCase = true) ||
               msg.contains("AudioTrack", ignoreCase = true)
    }

    fun sendStoppedBroadcast() {
        if (stoppedSent) return
        stoppedSent = true
        val p = player
        val intent = Intent(ACTION_STOPPED)
        if (p != null) {
            intent.putExtra("positionMs", p.currentPosition)
            intent.putExtra("durationMs", p.duration.coerceAtLeast(0L))
        }
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    private fun sendNextEpisodeBroadcast() {
        val intent = Intent(ACTION_NEXT_EPISODE)
        intent.putExtra("nextEpisodeId", nextEpisodeId)
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    private fun sendErrorBroadcast(message: String) {
        val intent = Intent(ACTION_ERROR)
        intent.putExtra("message", message)
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onResume() {
        super.onResume()
        player?.play()
    }

    override fun onDestroy() {
        super.onDestroy()
        sendStoppedBroadcast()
        handler.removeCallbacksAndMessages(null)
        audioSwitchPendingGroupIndex = -1
        unregisterReceiver(commandReceiver)
        playerNotificationManager?.setPlayer(null)
        playerNotificationManager = null
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
    }
}
