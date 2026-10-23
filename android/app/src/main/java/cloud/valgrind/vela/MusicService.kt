package cloud.valgrind.vela

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.util.concurrent.Executors

/**
 * Background music playback. Owns the ExoPlayer playlist and the MediaSession,
 * which gives us the media notification, lock-screen controls, headset /
 * Bluetooth buttons and audio focus. The WebView drives it through
 * [NativeAudioPlugin] via a MediaController. As a library service it also
 * serves the Jellyfin music library to Android Auto ([JellyfinLibrary]).
 */
class MusicService : MediaLibraryService() {

    companion object {
        /** Sent to controllers when a queue was started from outside the app (e.g. the car). */
        const val COMMAND_EXTERNAL_QUEUE = "externalQueue"
        private const val TAG = "MusicService"
        /** Library shuffle tops the queue up once this many tracks are left after the playing one. */
        private const val LIBRARY_SHUFFLE_REFILL_AT = 5
    }

    private var session: MediaLibrarySession? = null
    private lateinit var library: JellyfinLibrary
    // Library calls hit the network: keep them off the main thread.
    private val io = MoreExecutors.listeningDecorator(Executors.newFixedThreadPool(2))
    // Music library the car is shuffling; a queue from the app clears it
    // (the app tops up its own library shuffle).
    private var libraryShuffle: String? = null
    private var refilling = false

    override fun onCreate() {
        super.onCreate()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        // FFmpeg after MediaCodec, same as the video player, for formats the
        // platform can't decode (ALAC on some devices, etc.).
        val renderersFactory = object : DefaultRenderersFactory(this) {
            // AirPlay taps the decoded PCM at the end of the processor chain.
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): AudioSink = DefaultAudioSink.Builder(context)
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                .setAudioProcessorChain(
                    DefaultAudioSink.DefaultAudioProcessorChain(AirPlayManager.resampler, AirPlayManager.tee)
                )
                .build()
        }.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        val player = ExoPlayer.Builder(this, renderersFactory)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        AirPlayManager.attach(player)
        library = JellyfinLibrary(this)
        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = refillLibraryShuffle(player)
        })

        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // NativePlayerActivity has its own (default-id) session; ids must be unique.
        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setId("music")
            .setSessionActivity(openApp)
            .build()
    }

    /** More random picks before a car-started library shuffle runs out. */
    private fun refillLibraryShuffle(player: Player) {
        val libraryId = libraryShuffle ?: return
        if (refilling) return
        if (player.mediaItemCount - 1 - player.currentMediaItemIndex > LIBRARY_SHUFFLE_REFILL_AT) return
        refilling = true
        val queued = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }.toSet()
        val future = io.submit<List<MediaItem>> { library.randomTracks(libraryId) }
        future.addListener({
            refilling = false
            val picks = runCatching { future.get() }
                .onFailure { Log.w(TAG, "Library shuffle refill failed: ${it.message}") }
                .getOrNull()
            if (libraryShuffle != libraryId || picks.isNullOrEmpty()) return@addListener
            // A small library has been fully played: start a new round.
            player.addMediaItems(picks.filter { it.mediaId !in queued }.ifEmpty { picks })
            // Let the app adopt the longer queue if it's running.
            session?.broadcastCustomCommand(SessionCommand(COMMAND_EXTERNAL_QUEUE, Bundle.EMPTY), Bundle.EMPTY)
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        session?.run {
            AirPlayManager.detach(player as ExoPlayer)
            player.release()
            release()
        }
        session = null
        io.shutdownNow()
        super.onDestroy()
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        // The app sends ready-to-play items (URI in requestMetadata); the car
        // sends only ids or a voice query, which the library resolves.
        private fun isResolved(items: List<MediaItem>) =
            items.all { it.localConfiguration != null || it.requestMetadata.mediaUri != null }

        // MediaItems lose their URI when sent from a controller; it travels in
        // requestMetadata.mediaUri and is restored here.
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            if (isResolved(mediaItems)) {
                val resolved = mediaItems.map { item ->
                    if (item.localConfiguration != null) item
                    else item.buildUpon().setUri(item.requestMetadata.mediaUri).build()
                }.toMutableList()
                return Futures.immediateFuture(resolved)
            }
            // Picked in the car: only ids (or a voice query) come through.
            return io.submit<MutableList<MediaItem>> {
                library.resolve(mediaItems)?.first?.toMutableList() ?: mutableListOf()
            }
        }

        // A pick in the car replaces the queue with the rest of its album/playlist.
        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            libraryShuffle = mediaItems.firstOrNull()?.mediaId
                ?.takeIf { it.startsWith(JellyfinLibrary.SHUFFLE_PREFIX) }
                ?.removePrefix(JellyfinLibrary.SHUFFLE_PREFIX)
            if (isResolved(mediaItems)) {
                return super.onSetMediaItems(mediaSession, controller, mediaItems, startIndex, startPositionMs)
            }
            return io.submit<MediaSession.MediaItemsWithStartPosition> {
                val (queue, index) = library.resolve(mediaItems) ?: throw IllegalStateException("Nothing to play")
                MediaSession.MediaItemsWithStartPosition(queue, index, 0L)
            }.also { future ->
                future.addListener({
                    // Let the app adopt this queue (and report playback) if it's running.
                    if (runCatching { future.get() }.isSuccess) {
                        session?.broadcastCustomCommand(SessionCommand(COMMAND_EXTERNAL_QUEUE, Bundle.EMPTY), Bundle.EMPTY)
                    }
                }, ContextCompat.getMainExecutor(this@MusicService))
            }
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(library.root(), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
            if (!library.isConfigured) return@submit LibraryResult.ofError(SessionError.ERROR_SESSION_AUTHENTICATION_EXPIRED)
            try {
                val all = library.children(parentId)
                val from = (page * pageSize).coerceAtMost(all.size)
                LibraryResult.ofItemList(all.subList(from, (from + pageSize).coerceAtMost(all.size)), params)
            } catch (e: Exception) {
                Log.w(TAG, "Browse $parentId failed: ${e.message}")
                LibraryResult.ofError(SessionError.ERROR_IO)
            }
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<Void>> {
            io.execute {
                val count = runCatching { library.search(query).size }.getOrDefault(0)
                session.notifySearchResultChanged(browser, query, count, params)
            }
            return Futures.immediateFuture(LibraryResult.ofVoid())
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
            try {
                val all = library.search(query)
                val from = (page * pageSize).coerceAtMost(all.size)
                LibraryResult.ofItemList(all.subList(from, (from + pageSize).coerceAtMost(all.size)), params)
            } catch (e: Exception) {
                LibraryResult.ofError(SessionError.ERROR_IO)
            }
        }
    }
}
