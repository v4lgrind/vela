package com.jellyfin_v4lgrind_client.app

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.app.MediaRouteControllerDialog
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaQueueData
import com.google.android.gms.cast.MediaQueueItem
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.cast.framework.CastStateListener
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import org.json.JSONObject

private const val TAG = "CastAudio"
private const val TICK_MS = 1000L
private const val RESTART_THRESHOLD_MS = 3000L

/** Google's Default Media Receiver: plays plain stream URLs on any Cast device, speakers included. */
const val DEFAULT_MEDIA_RECEIVER_ID = "CC1AD845"

/**
 * Casts the music queue to a Google Cast device and lets the app's player
 * drive it. Mirrors [NativeAudioPlugin]'s API and `stateChange` events so the
 * JS side can swap engines while a session is up.
 */
@CapacitorPlugin(name = "CastAudio")
class CastAudioPlugin : Plugin() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var castContext: CastContext? = null
    private var session: CastSession? = null
    private val client: RemoteMediaClient? get() = session?.remoteMediaClient

    private val ticker = object : Runnable {
        override fun run() {
            emitState()
            mainHandler.postDelayed(this, TICK_MS)
        }
    }

    private val clientCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            emitState()
            mainHandler.removeCallbacks(ticker)
            if (client?.isPlaying == true) mainHandler.postDelayed(ticker, TICK_MS)
        }

        override fun onQueueStatusUpdated() = emitState()
    }

    private val routeSelector = MediaRouteSelector.Builder()
        .addControlCategory(CastMediaControlIntent.categoryForCast(DEFAULT_MEDIA_RECEIVER_ID))
        .build()

    // Keeps passive discovery running while the app is in the foreground, so
    // the cast state (and the cast button) reflects devices on the network.
    private val routerCallback = object : MediaRouter.Callback() {}

    private val castStateListener = CastStateListener { notifyListeners("availabilityChange", availability()) }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(s: CastSession, sessionId: String) = attach(s)
        override fun onSessionResumed(s: CastSession, wasSuspended: Boolean) = attach(s)
        override fun onSessionEnded(s: CastSession, error: Int) = detach()
        override fun onSessionStartFailed(s: CastSession, error: Int) {
            Log.w(TAG, "Cast session failed to start: $error")
        }
        override fun onSessionStarting(s: CastSession) {}
        override fun onSessionEnding(s: CastSession) {}
        override fun onSessionResuming(s: CastSession, sessionId: String) {}
        override fun onSessionResumeFailed(s: CastSession, error: Int) {}
        override fun onSessionSuspended(s: CastSession, reason: Int) {}
    }

    override fun load() {
        mainHandler.post {
            try {
                val ctx = CastContext.getSharedInstance(context)
                castContext = ctx
                // Discovery filters devices by receiver; the Jellyfin one (the
                // static default) skips audio-only speakers like the Nest Mini.
                ctx.setReceiverApplicationId(DEFAULT_MEDIA_RECEIVER_ID)
                ctx.addCastStateListener(castStateListener)
                ctx.sessionManager.addSessionManagerListener(sessionListener, CastSession::class.java)
            } catch (e: Exception) {
                Log.w(TAG, "Cast unavailable", e)
            }
        }
    }

    override fun handleOnResume() {
        mainHandler.post {
            MediaRouter.getInstance(context)
                .addCallback(routeSelector, routerCallback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
        }
    }

    override fun handleOnPause() {
        mainHandler.post { MediaRouter.getInstance(context).removeCallback(routerCallback) }
    }

    override fun handleOnDestroy() {
        mainHandler.removeCallbacks(ticker)
        client?.unregisterCallback(clientCallback)
        castContext?.removeCastStateListener(castStateListener)
        castContext?.sessionManager?.removeSessionManagerListener(sessionListener, CastSession::class.java)
    }

    private fun attach(s: CastSession) {
        // A session running another receiver (the Jellyfin one, from the video
        // cast button) can't play our queue.
        if (s.applicationMetadata?.applicationId != DEFAULT_MEDIA_RECEIVER_ID) return
        session = s
        s.remoteMediaClient?.registerCallback(clientCallback)
        notifyListeners("sessionStarted", JSObject().put("deviceName", s.castDevice?.friendlyName ?: ""))
    }

    private fun detach() {
        if (session == null) return
        mainHandler.removeCallbacks(ticker)
        client?.unregisterCallback(clientCallback)
        session = null
        notifyListeners("sessionEnded", JSObject())
    }

    private fun availability() = JSObject()
        .put("available", castContext != null && castContext?.castState != CastState.NO_DEVICES_AVAILABLE)
        .put("deviceName", session?.castDevice?.friendlyName)

    private fun onMain(call: PluginCall, block: () -> Unit) {
        mainHandler.post {
            try {
                block()
            } catch (e: Exception) {
                Log.e(TAG, "Command failed", e)
                call.reject(e.message ?: "Cast command failed")
            }
        }
    }

    /** Device chooser when idle, the device's control dialog (volume, stop) when casting. */
    @PluginMethod
    fun showDialog(call: PluginCall) = onMain(call) {
        val ctx = castContext ?: run { call.reject("Cast unavailable"); return@onMain }
        if (session != null) {
            MediaRouteControllerDialog(activity).show()
        } else {
            ctx.setReceiverApplicationId(DEFAULT_MEDIA_RECEIVER_ID)
            MediaRouteChooserDialog(activity).apply { routeSelector = this@CastAudioPlugin.routeSelector }.show()
        }
        call.resolve()
    }

    @PluginMethod
    fun getAvailability(call: PluginCall) = onMain(call) { call.resolve(availability()) }

    @PluginMethod
    fun setQueue(call: PluginCall) {
        val tracks = call.getArray("tracks") ?: JSArray()
        val startIndex = call.getInt("startIndex") ?: 0
        val startPositionMs = call.data.optLong("startPositionMs", 0L)
        val autoplay = call.getBoolean("playWhenReady") ?: true
        val repeatMode = toCastRepeat(call.getString("repeatMode"))
        onMain(call) {
            val c = client ?: run { call.reject("Not casting"); return@onMain }
            val queue = MediaQueueData.Builder()
                .setItems(toQueueItems(tracks))
                .setStartIndex(startIndex)
                .setRepeatMode(repeatMode)
                .build()
            c.load(
                MediaLoadRequestData.Builder()
                    .setQueueData(queue)
                    .setCurrentTime(startPositionMs)
                    .setAutoplay(autoplay)
                    .build()
            )
            call.resolve()
        }
    }

    @PluginMethod
    fun play(call: PluginCall) = command(call) { it.play() }

    @PluginMethod
    fun pause(call: PluginCall) = command(call) { it.pause() }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        val positionMs = call.data.optLong("positionMs", 0L)
        command(call) { it.seek(MediaSeekOptions.Builder().setPosition(positionMs).build()) }
    }

    @PluginMethod
    fun skipTo(call: PluginCall) {
        val index = call.getInt("index") ?: 0
        command(call) { c -> itemIdAt(c, index)?.let { c.queueJumpToItem(it, null) } }
    }

    @PluginMethod
    fun next(call: PluginCall) = command(call) { it.queueNext(null) }

    @PluginMethod
    fun previous(call: PluginCall) = command(call) { c ->
        if (c.approximateStreamPosition > RESTART_THRESHOLD_MS) {
            c.seek(MediaSeekOptions.Builder().setPosition(0).build())
        } else {
            c.queuePrev(null)
        }
    }

    /** Sets the Cast device's own volume. */
    @PluginMethod
    fun setVolume(call: PluginCall) {
        val volume = call.data.optDouble("volume", 1.0).coerceIn(0.0, 1.0)
        onMain(call) {
            session?.volume = volume
            call.resolve()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) = command(call) { it.stop() }

    @PluginMethod
    fun addTracks(call: PluginCall) {
        val tracks = call.getArray("tracks") ?: JSArray()
        val index = call.getInt("index") ?: Int.MAX_VALUE
        command(call) { c ->
            val beforeId = itemIdAt(c, index) ?: MediaQueueItem.INVALID_ITEM_ID
            c.queueInsertItems(toQueueItems(tracks).toTypedArray(), beforeId, null)
        }
    }

    @PluginMethod
    fun removeTrack(call: PluginCall) {
        val index = call.getInt("index") ?: -1
        command(call) { c -> itemIdAt(c, index)?.let { c.queueRemoveItem(it, null) } }
    }

    @PluginMethod
    fun moveTrack(call: PluginCall) {
        val from = call.getInt("from") ?: 0
        val to = call.getInt("to") ?: 0
        command(call) { c -> itemIdAt(c, from)?.let { c.queueMoveItemToNewIndex(it, to, null) } }
    }

    @PluginMethod
    fun setRepeatMode(call: PluginCall) {
        val mode = toCastRepeat(call.getString("mode"))
        command(call) { it.queueSetRepeatMode(mode, null) }
    }

    /** Disconnects from the device (stops the receiver). */
    @PluginMethod
    fun endSession(call: PluginCall) = onMain(call) {
        castContext?.sessionManager?.endCurrentSession(true)
        call.resolve()
    }

    private fun command(call: PluginCall, block: (RemoteMediaClient) -> Unit) = onMain(call) {
        val c = client ?: run { call.reject("Not casting"); return@onMain }
        block(c)
        call.resolve()
    }

    private fun itemIdAt(c: RemoteMediaClient, index: Int): Int? =
        c.mediaStatus?.getQueueItem(index)?.itemId

    private fun emitState() {
        val c = client ?: return
        val status = c.mediaStatus ?: return
        val currentId = status.currentItemId
        val track = status.getQueueItemById(currentId)?.media?.customData
        val ended = status.playerState == MediaStatus.PLAYER_STATE_IDLE &&
            status.idleReason == MediaStatus.IDLE_REASON_FINISHED
        notifyListeners(
            "stateChange",
            JSObject()
                .put("index", status.getIndexById(currentId) ?: -1)
                .put("trackId", track?.optString("trackId") ?: "")
                .put("isPlaying", c.isPlaying || c.isBuffering)
                .put("ended", ended)
                .put("positionMs", c.approximateStreamPosition)
                .put("durationMs", c.streamDuration.coerceAtLeast(0L)),
        )
    }

    private fun toCastRepeat(mode: String?) = when (mode) {
        "all" -> MediaStatus.REPEAT_MODE_REPEAT_ALL
        "one" -> MediaStatus.REPEAT_MODE_REPEAT_SINGLE
        else -> MediaStatus.REPEAT_MODE_REPEAT_OFF
    }

    private fun toQueueItems(tracks: JSArray): List<MediaQueueItem> =
        (0 until tracks.length()).map { toQueueItem(tracks.getJSONObject(it)) }

    private fun toQueueItem(t: JSONObject): MediaQueueItem {
        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
            putString(MediaMetadata.KEY_TITLE, t.optString("title"))
            putString(MediaMetadata.KEY_ARTIST, t.optString("artist"))
            putString(MediaMetadata.KEY_ALBUM_TITLE, t.optString("album"))
            t.optString("artworkUrl").takeIf { it.isNotEmpty() }?.let { addImage(WebImage(Uri.parse(it))) }
        }
        val url = t.getString("url")
        val media = MediaInfo.Builder(url)
            .setContentUrl(url)
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType("audio/mpeg")
            .setMetadata(metadata)
            .setCustomData(JSONObject().put("trackId", t.getString("id")))
            .build()
        return MediaQueueItem.Builder(media)
            .setAutoplay(true)
            .setPreloadTime(10.0)
            .build()
    }
}
