package com.jellyfin_v4lgrind_client.app

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var cachedWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = getWebView()
        if (webView != null) {
          webView.evaluateJavascript(
            "(function(){try{return window.__goBack();}catch(e){return false;}})()"
          ) { result ->
            if (result == "false" || result == "null" || result == "undefined") {
              finish()
            }
          }
        } else {
          finish()
        }
      }
    })
  }

  private fun getWebView(): WebView? {
    cachedWebView?.let { if (it.parent != null) return it }
    cachedWebView = findWebView(window.decorView)
    return cachedWebView
  }

  private fun findWebView(view: View?): WebView? {
    if (view == null) return null
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        try {
          val result = findWebView(view.getChildAt(i))
          if (result != null) return result
        } catch (e: Exception) {
          continue
        }
      }
    }
    return null
  }
}
