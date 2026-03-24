package com.jellyfin_v4lgrind_client.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.cast.framework.CastStateListener
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import org.json.JSONObject

@CapacitorPlugin(name = "Cast")
class CastPlugin : Plugin() {

    private var castContext: CastContext? = null
    private var castStateListener: CastStateListener? = null
    private var sessionManagerListener: SessionManagerListener<com.google.android.gms.cast.framework.Session>? = null

    @PluginMethod
    fun initialize(call: PluginCall) {
        activity.runOnUiThread {
            try {
                castContext = CastContext.getSharedInstance(context)

                castStateListener = CastStateListener { state ->
                    val stateStr = when (state) {
                        CastState.NO_DEVICES_AVAILABLE -> "NO_DEVICES_AVAILABLE"
                        CastState.NOT_CONNECTED -> "NOT_CONNECTED"
                        CastState.CONNECTING -> "CONNECTING"
                        CastState.CONNECTED -> "CONNECTED"
                        else -> "UNKNOWN"
                    }
                    val data = JSObject()
                    data.put("state", stateStr)
                    notifyListeners("castStateChanged", data)
                }
                castContext?.addCastStateListener(castStateListener!!)

                @Suppress("UNCHECKED_CAST")
                sessionManagerListener = object : SessionManagerListener<com.google.android.gms.cast.framework.Session> {
                    override fun onSessionStarted(session: com.google.android.gms.cast.framework.Session, sessionId: String) {
                        val data = JSObject()
                        data.put("sessionId", sessionId)
                        notifyListeners("sessionStarted", data)
                    }
                    override fun onSessionEnded(session: com.google.android.gms.cast.framework.Session, error: Int) {
                        notifyListeners("sessionEnded", JSObject())
                    }
                    override fun onSessionResumed(session: com.google.android.gms.cast.framework.Session, wasSuspended: Boolean) {}
                    override fun onSessionStartFailed(session: com.google.android.gms.cast.framework.Session, error: Int) {
                        val data = JSObject()
                        data.put("error", error)
                        notifyListeners("sessionEnded", data)
                    }
                    override fun onSessionResumeFailed(session: com.google.android.gms.cast.framework.Session, error: Int) {}
                    override fun onSessionSuspended(session: com.google.android.gms.cast.framework.Session, reason: Int) {}
                    override fun onSessionStarting(session: com.google.android.gms.cast.framework.Session) {}
                    override fun onSessionEnding(session: com.google.android.gms.cast.framework.Session) {}
                    override fun onSessionResuming(session: com.google.android.gms.cast.framework.Session, sessionId: String) {}
                }
                @Suppress("UNCHECKED_CAST")
                castContext?.sessionManager?.addSessionManagerListener(
                    sessionManagerListener as SessionManagerListener<com.google.android.gms.cast.framework.Session>
                )

                call.resolve()
            } catch (e: Exception) {
                call.reject("Cast initialization failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun showPicker(call: PluginCall) {
        activity.runOnUiThread {
            try {
                if (castContext == null) {
                    call.reject("Cast not initialized")
                    return@runOnUiThread
                }
                val selector = androidx.mediarouter.media.MediaRouteSelector.Builder()
                    .addControlCategory(CastMediaControlIntent.categoryForCast("F007D354"))
                    .build()
                val dialog = androidx.mediarouter.app.MediaRouteChooserDialog(activity)
                dialog.routeSelector = selector
                dialog.show()
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to show Cast picker: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun castMedia(call: PluginCall) {
        val itemId = call.getString("itemId") ?: run { call.reject("itemId required"); return }
        val serverUrl = call.getString("serverUrl") ?: run { call.reject("serverUrl required"); return }
        val accessToken = call.getString("accessToken") ?: run { call.reject("accessToken required"); return }
        val startPositionTicks = call.data.optLong("startPositionTicks", 0L)
        val title = call.getString("title") ?: ""

        activity.runOnUiThread {
            try {
                val remoteMediaClient = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
                    ?: run { call.reject("No active Cast session"); return@runOnUiThread }

                // Build custom data payload for Jellyfin receiver
                val customData = JSONObject().apply {
                    put("itemId", itemId)
                    put("serverAddress", serverUrl)
                    put("accessToken", accessToken)
                    put("startPositionTicks", startPositionTicks)
                }

                val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply {
                    putString(MediaMetadata.KEY_TITLE, title)
                }

                val mediaInfo = MediaInfo.Builder("jellyfin://$itemId")
                    .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                    .setContentType("video/mp4")
                    .setMetadata(metadata)
                    .setCustomData(customData)
                    .build()

                val loadRequest = MediaLoadRequestData.Builder()
                    .setMediaInfo(mediaInfo)
                    .setCurrentTime(startPositionTicks / 10_000) // ticks → ms
                    .setAutoplay(true)
                    .build()

                remoteMediaClient.load(loadRequest)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Cast failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun stopCasting(call: PluginCall) {
        activity.runOnUiThread {
            castContext?.sessionManager?.endCurrentSession(true)
            call.resolve()
        }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        activity.runOnUiThread {
            val state = when (castContext?.castState) {
                CastState.NO_DEVICES_AVAILABLE -> "NO_DEVICES_AVAILABLE"
                CastState.NOT_CONNECTED -> "NOT_CONNECTED"
                CastState.CONNECTING -> "CONNECTING"
                CastState.CONNECTED -> "CONNECTED"
                else -> "NOT_CONNECTED"
            }
            val result = JSObject()
            result.put("state", state)
            call.resolve(result)
        }
    }

    override fun handleOnDestroy() {
        castStateListener?.let { castContext?.removeCastStateListener(it) }
        @Suppress("UNCHECKED_CAST")
        (sessionManagerListener as? SessionManagerListener<com.google.android.gms.cast.framework.Session>)?.let {
            castContext?.sessionManager?.removeSessionManagerListener(it)
        }
    }
}
