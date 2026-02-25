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
import android.widget.ImageButton
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
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

        const val CMD_STOP = "stop"
        const val CMD_PAUSE = "pause"
        const val CMD_RESUME = "resume"
        const val CMD_SEEK = "seek"
        const val CMD_SELECT_AUDIO = "selectAudio"
        const val CMD_SELECT_SUBTITLE = "selectSubtitle"
    }

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var controlsOverlay: View
    private lateinit var btnBack: ImageButton
    private lateinit var btnPlayPause: ImageButton
    private lateinit var btnAudio: ImageButton
    private lateinit var btnSubtitle: ImageButton
    private lateinit var btnFullscreen: ImageButton
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
            handler.postDelayed(this, 500)
        }
    }

    private var isUserSeeking = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on, extend layout edge-to-edge, then hide system bars.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowInsetsControllerCompat(window, window.decorView).let { ctrl ->
            ctrl.hide(WindowInsetsCompat.Type.systemBars())
            ctrl.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
        }
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

        val url = intent.getStringExtra(EXTRA_URL) ?: run {
            finish()
            return
        }
        val authHeader = intent.getStringExtra(EXTRA_AUTH_HEADER) ?: ""
        val startMs = intent.getLongExtra(EXTRA_START_MS, 0L)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: ""
        val playMethod = intent.getStringExtra(EXTRA_PLAY_METHOD) ?: "Transcode"
        val subtitleTracksJson = intent.getStringExtra(EXTRA_SUBTITLE_TRACKS) ?: "[]"

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

        LocalBroadcastManager.getInstance(this).registerReceiver(
            commandReceiver,
            IntentFilter(ACTION_COMMAND)
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

        if (startMs > 0) exo.seekTo(startMs)
        exo.setMediaSource(mediaSource)
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
                sendErrorBroadcast(error.message ?: "Playback error")
            }
        })

        playerView.player = exo
        player = exo

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
                if (group.isSelected) selectedAudioGroupIndex = groupIndex
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
        if (audioTrackGroups.size > 1) btnAudio.visibility = View.VISIBLE
        if (subtitleTrackGroups.isNotEmpty()) btnSubtitle.visibility = View.VISIBLE

        val result = JSONObject()
        result.put("audioTracks", audioArr)
        result.put("subtitleTracks", subtitleArr)

        val broadcastIntent = Intent(ACTION_TRACKS)
        broadcastIntent.putExtra("tracks", result.toString())
        LocalBroadcastManager.getInstance(this).sendBroadcast(broadcastIntent)
    }

    private fun selectAudioTrack(groupIndex: Int) {
        val p = player ?: return
        val group = audioTrackGroups.firstOrNull { it.first == groupIndex } ?: return
        p.trackSelectionParameters = p.trackSelectionParameters
            .buildUpon()
            .setOverrideForType(TrackSelectionOverride(group.second, 0))
            .build()
        selectedAudioGroupIndex = groupIndex
    }

    private fun selectSubtitleTrack(groupIndex: Int) {
        val p = player ?: return
        if (groupIndex < 0) {
            // Disable subtitles
            p.trackSelectionParameters = p.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
            selectedSubtitleGroupIndex = -1
        } else {
            val group = subtitleTrackGroups.firstOrNull { it.first == groupIndex } ?: return
            p.trackSelectionParameters = p.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setOverrideForType(TrackSelectionOverride(group.second, 0))
                .build()
            selectedSubtitleGroupIndex = groupIndex
        }
    }

    private fun showAudioPicker() {
        if (audioTrackGroups.isEmpty()) return
        val labels = audioTrackGroups.map { (idx, group) ->
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
        val intent = Intent(ACTION_PROGRESS)
        intent.putExtra("positionMs", posMs)
        intent.putExtra("durationMs", durMs)
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    private fun sendEndedBroadcast() {
        LocalBroadcastManager.getInstance(this).sendBroadcast(Intent(ACTION_ENDED))
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
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    private fun sendErrorBroadcast(message: String) {
        val intent = Intent(ACTION_ERROR)
        intent.putExtra("message", message)
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
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
        LocalBroadcastManager.getInstance(this).unregisterReceiver(commandReceiver)
        player?.release()
        player = null
    }
}
