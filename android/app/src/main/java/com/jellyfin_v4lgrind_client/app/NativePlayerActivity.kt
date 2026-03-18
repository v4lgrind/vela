package com.jellyfin_v4lgrind_client.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
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
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackGroup
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
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

        const val EXTRA_AUDIO_TRACKS = "audioTracks"

        const val CMD_STOP = "stop"
        const val CMD_PAUSE = "pause"
        const val CMD_RESUME = "resume"
        const val CMD_SEEK = "seek"
        const val CMD_SELECT_AUDIO = "selectAudio"
        const val CMD_SELECT_SUBTITLE = "selectSubtitle"
        const val CMD_SET_INTRO = "setIntro"
        const val CMD_UPDATE_QUALITY_PRESETS = "updateQualityPresets"
        const val CMD_UPDATE_STREAM_INFO = "updateStreamInfo"

        const val EXTRA_QUALITY_PRESETS = "qualityPresets"
        const val EXTRA_SELECTED_BITRATE = "selectedBitrate"
        const val EXTRA_STREAM_INFO = "streamInfo"
    }

    private var player: ExoPlayer? = null
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
    private lateinit var seekBar: SeekBar
    private lateinit var tvCurrentTime: TextView
    private lateinit var tvTotalTime: TextView
    private lateinit var tvTitle: TextView

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

    // Quality presets & stream info (passed from Vue)
    private var qualityPresets = mutableListOf<Pair<Int, String>>() // (bitrate, label)
    private var selectedBitrate = 0
    private var streamInfoJson = ""

    // Jellyfin audio tracks passed from Vue — used when ExoPlayer only has 1 track (transcoded stream)
    // Triple: (jellyfinIndex, label, language)
    private val jellyfinAudioTracks = mutableListOf<Triple<Int, String, String>>()

    private val commandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getStringExtra("command")) {
                CMD_STOP -> finish()
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

            handler.postDelayed(this, 500)
        }
    }

    private var isUserSeeking = false
    private var introStartMs = -1L
    private var introEndMs = -1L
    private var introSkipped = false

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
        controlsOverlay = findViewById(R.id.controls_overlay)
        btnBack = findViewById(R.id.btn_back)
        btnPlayPause = findViewById(R.id.btn_play_pause)
        btnAudio = findViewById(R.id.btn_audio)
        btnSubtitle = findViewById(R.id.btn_subtitle)
        btnFullscreen = findViewById(R.id.btn_fullscreen)
        seekBar = findViewById(R.id.seek_bar)
        tvCurrentTime = findViewById(R.id.tv_current_time)
        tvTotalTime = findViewById(R.id.tv_total_time)
        tvTitle = findViewById(R.id.tv_title)
        btnSkipIntro = findViewById(R.id.btn_skip_intro)
        btnQuality = findViewById(R.id.btn_quality)
        btnInfo = findViewById(R.id.btn_info)

        val url = intent.getStringExtra(EXTRA_URL) ?: run {
            finish()
            return
        }
        val authHeader = intent.getStringExtra(EXTRA_AUTH_HEADER) ?: ""
        val startMs = intent.getLongExtra(EXTRA_START_MS, 0L)
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
        if (jellyfinAudioTracks.size > 1) btnAudio.visibility = View.VISIBLE

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

        // Tap on player view toggles controls
        playerView.setOnClickListener { toggleControls() }
        controlsOverlay.setOnClickListener { toggleControls() }

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
        val httpFactory = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(mapOf("Authorization" to authHeader))
        val dataFactory = DefaultDataSource.Factory(this, httpFactory)

        val audioAttr = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        // Parse subtitle configurations from JSON
        val subtitleConfigs = parseSubtitleConfigs(subtitleTracksJson)

        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .setSubtitleConfigurations(subtitleConfigs)
            .build()

        val mediaSource = if (playMethod == "DirectPlay" && !url.contains(".m3u8")) {
            ProgressiveMediaSource.Factory(dataFactory).createMediaSource(mediaItem)
        } else {
            HlsMediaSource.Factory(dataFactory).createMediaSource(mediaItem)
        }

        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttr, true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        android.util.Log.d("NativePlayer", "buildPlayer: startMs=$startMs playMethod=$playMethod isHls=${url.contains(".m3u8")}")

        exo.setMediaSource(mediaSource)
        // For HLS (transcode / direct-stream), Jellyfin already starts the stream at
        // the requested position via StartTimeTicks in the URL — no additional seek needed.
        // For raw-file DirectPlay the stream always starts at byte 0, so we must seek.
        val isRawDirectPlay = playMethod == "DirectPlay" && !url.contains(".m3u8")
        if (startMs > 0 && isRawDirectPlay) exo.seekTo(startMs)
        android.util.Log.d("NativePlayer", "isRawDirectPlay=$isRawDirectPlay seekTo=${if (startMs > 0 && isRawDirectPlay) startMs else -1L}")
        exo.prepare()
        exo.playWhenReady = true

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_READY -> {
                        if (!tracksReported) {
                            tracksReported = true
                            reportTracks(exo)
                        }
                        handler.post(seekBarUpdateRunnable)
                        handler.post(progressRunnable)
                    }
                    Player.STATE_ENDED -> {
                        handler.removeCallbacks(progressRunnable)
                        handler.removeCallbacks(seekBarUpdateRunnable)
                        sendProgressBroadcast(exo.duration.coerceAtLeast(0L), exo.duration.coerceAtLeast(0L))
                        sendEndedBroadcast()
                    }
                    Player.STATE_BUFFERING -> { /* loading */ }
                    Player.STATE_IDLE -> { /* idle */ }
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                btnPlayPause.setImageResource(if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play)
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                android.util.Log.e("NativePlayer", "[AudioCrash] onPlayerError: code=${error.errorCode} msg=${error.message}")
                android.util.Log.e("NativePlayer", "[AudioCrash]   pendingIdx=$audioSwitchPendingGroupIndex pendingLang=$audioSwitchPendingLanguage selectedAudioGroupIndex=$selectedAudioGroupIndex")
                android.util.Log.e("NativePlayer", "[AudioCrash]   isAudioPlaybackError=${isAudioPlaybackError(error)}")
                var c: Throwable? = error.cause
                var depth = 0
                while (c != null) {
                    android.util.Log.e("NativePlayer", "[AudioCrash]   cause[$depth]: ${c.javaClass.name}: ${c.message}")
                    c = c.cause; depth++
                }
                handler.removeCallbacks(clearAudioSwitchPending)
                val pendingIdx = audioSwitchPendingGroupIndex
                val pendingLang = audioSwitchPendingLanguage
                audioSwitchPendingGroupIndex = -1
                audioSwitchPendingLanguage = ""
                when {
                    pendingIdx >= 0 -> {
                        android.util.Log.d("NativePlayer", "[AudioCrash] → branch: pendingSwitch (idx=$pendingIdx lang=$pendingLang)")
                        sendAudioErrorBroadcast(pendingIdx, pendingLang)
                    }
                    selectedAudioGroupIndex >= 0 && isAudioPlaybackError(error) -> {
                        val group = audioTrackGroups.firstOrNull { it.first == selectedAudioGroupIndex }
                        val language = group?.second?.getFormat(0)?.language ?: "und"
                        android.util.Log.d("NativePlayer", "[AudioCrash] → branch: autoSelected (selectedIdx=$selectedAudioGroupIndex lang=$language)")
                        sendAudioErrorBroadcast(selectedAudioGroupIndex, language)
                    }
                    else -> {
                        android.util.Log.d("NativePlayer", "[AudioCrash] → branch: genericError (no audio fallback)")
                        sendErrorBroadcast(error.message ?: "Playback error")
                    }
                }
            }
        })

        playerView.player = exo
        player = exo

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

        scheduleHideControls()
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
                    android.util.Log.d("NativePlayer", "[AudioCrash] reportTracks: auto-selected audio groupIndex=$groupIndex lang=${format.language} codec=${format.codecs}")
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
        if (subtitleTrackGroups.isNotEmpty()) btnSubtitle.visibility = View.VISIBLE

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
        android.util.Log.d("NativePlayer", "[AudioCrash] selectAudioTrack: groupIndex=$groupIndex lang=$language codec=${group.second.getFormat(0).codecs}")
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
            // Determine current selection by matching language to the active ExoPlayer track
            val currentLang = audioTrackGroups.firstOrNull { it.first == selectedAudioGroupIndex }
                ?.second?.getFormat(0)?.language ?: ""
            val checkedItem = jellyfinAudioTracks.indexOfFirst { it.third == currentLang }
            androidx.appcompat.app.AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog)
                .setTitle("Audio Track")
                .setSingleChoiceItems(labels, checkedItem) { dialog, which ->
                    val (jellyfinIndex, _, _) = jellyfinAudioTracks[which]
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
        if (subtitleTrackGroups.isEmpty()) return
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
        player?.release()
        player = null
    }
}
