package cloud.valgrind.vela

import android.content.Context
import androidx.media3.common.MediaItem

/**
 * The music library Android Auto browses while the app (and its WebView) may
 * not run: one implementation per server kind, picked from the config the app
 * pushes through [NativeAudioPlugin.setLibraryConfig].
 *
 * Media ids: `root`, `shuffle:<libraryId>`, `latest`, `albums`, `artists`, `playlists`,
 * `album:<id>`, `artist:<id>`, `playlist:<id>`, and for browse tracks
 * `track:<trackId>:<parent>` so a pick can queue the rest of its parent.
 * Queued items use the plain track id, like the queues the app builds.
 */
interface MusicLibrary {
    val isConfigured: Boolean
    fun root(): MediaItem
    /** Blocking (network). Children of a browsable [parentId]. */
    fun children(parentId: String): List<MediaItem>
    /** Blocking (network). Artists, albums and songs matching [query]. */
    fun search(query: String): List<MediaItem>
    /** Blocking (network). A queue and its start index for what the car picked. */
    fun resolve(items: List<MediaItem>): Pair<List<MediaItem>, Int>?
    /** Blocking (network). Random songs from a music library. */
    fun randomTracks(libraryId: String): List<MediaItem>
    /** For [ArtworkProvider]: the cover URL of [itemId] and the headers to send. */
    fun imageRequest(itemId: String): Pair<String, Map<String, String>>?

    companion object {
        const val ROOT = "root"
        /** `shuffle:<libraryId>`: random picks from a music library; MusicService tops the queue up. */
        const val SHUFFLE_PREFIX = "shuffle:"
        const val PREFS = "music_library"

        fun saveConfig(
            context: Context, kind: String, serverUrl: String, token: String, userId: String, clientId: String, maxBitrate: Long,
        ) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("kind", kind)
                .putString("serverUrl", serverUrl.trimEnd('/'))
                .putString("token", token)
                .putString("userId", userId)
                .putString("clientId", clientId)
                .putLong("maxBitrate", maxBitrate)
                .apply()
        }

        /** The library of the account the app last signed in with. */
        fun current(context: Context): MusicLibrary =
            if (context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("kind", "jellyfin") == "plex") PlexLibrary(context)
            else JellyfinLibrary(context)
    }
}
