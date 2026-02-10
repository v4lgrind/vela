package com.jellyfin_v4lgrind_client.app

import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback

class OrientationBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun lockLandscape() {
    activity.runOnUiThread {
      activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }
  }

  @JavascriptInterface
  fun unlock() {
    activity.runOnUiThread {
      activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
  }
}

class AudioServiceBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun startService(trackName: String, artistName: String, albumArtUrl: String) {
    val intent = Intent(activity, AudioPlaybackService::class.java).apply {
      putExtra(AudioPlaybackService.EXTRA_TRACK_NAME, trackName)
      putExtra(AudioPlaybackService.EXTRA_ARTIST_NAME, artistName)
      putExtra(AudioPlaybackService.EXTRA_IS_PLAYING, true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.startForegroundService(intent)
    } else {
      activity.startService(intent)
    }
  }

  @JavascriptInterface
  fun updateNotification(trackName: String, artistName: String, isPlaying: Boolean) {
    val intent = Intent(activity, AudioPlaybackService::class.java).apply {
      putExtra(AudioPlaybackService.EXTRA_TRACK_NAME, trackName)
      putExtra(AudioPlaybackService.EXTRA_ARTIST_NAME, artistName)
      putExtra(AudioPlaybackService.EXTRA_IS_PLAYING, isPlaying)
    }
    activity.startService(intent)
  }

  @JavascriptInterface
  fun stopService() {
    val intent = Intent(activity, AudioPlaybackService::class.java)
    activity.stopService(intent)
  }
}

class MainActivity : TauriActivity() {
  companion object {
    private var instance: MainActivity? = null

    fun evaluateJs(script: String) {
      val activity = instance ?: return
      activity.runOnUiThread {
        activity.webView?.evaluateJavascript(script, null)
      }
    }
  }

  private var webView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(OrientationBridge(this), "AndroidOrientation")
    webView.addJavascriptInterface(AudioServiceBridge(this), "AndroidAudioService")

    // Keep WebView alive for background audio
    webView.settings.mediaPlaybackRequiresUserGesture = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    instance = this

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val wv = webView
        if (wv != null) {
          wv.evaluateJavascript(
            "(function(){try{return window.__handleBack();}catch(e){return 'exit';}})()"
          ) { result ->
            if (result == "\"exit\"" || result == null || result == "null") {
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
              isEnabled = true
            }
          }
        } else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    })
  }

  override fun onDestroy() {
    if (instance == this) instance = null
    super.onDestroy()
  }
}
