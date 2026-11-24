package cloud.valgrind.vela

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Plex's music library for Android Auto ([MusicLibrary]). Requests and JSON
 * live in [PlexMusicApi]; this class turns them into the car's browse tree
 * and queues (same media ids as [JellyfinLibrary]).
 */
class PlexLibrary(private val context: Context) : MusicLibrary {

    private val prefs get() = context.getSharedPreferences(MusicLibrary.PREFS, Context.MODE_PRIVATE)
    private val server get() = prefs.getString("serverUrl", "") ?: ""
    private val token get() = prefs.getString("token", "") ?: ""
    private val maxBitrate get() = prefs.getLong("maxBitrate", 140_000_000L)

    private val api by lazy { PlexMusicApi(server, token, prefs.getString("clientId", "") ?: "", ::httpGet) }

    override val isConfigured get() = server.isNotEmpty() && token.isNotEmpty()

    override fun root(): MediaItem = folder(MusicLibrary.ROOT, "Vela")

    override fun children(parentId: String): List<MediaItem> = when {
        parentId == MusicLibrary.ROOT -> api.musicLibraries().map(::shuffleItem) + listOf(
            folder("latest", context.getString(R.string.auto_latest)),
            folder("albums", context.getString(R.string.auto_albums)),
            folder("artists", context.getString(R.string.auto_artists)),
            folder("playlists", context.getString(R.string.auto_playlists)),
        )
        parentId == "latest" -> api.latestAlbums().map(::albumItem)
        parentId == "albums" -> api.albums().map(::albumItem)
        parentId == "artists" -> api.artists().map(::artistItem)
        parentId == "playlists" -> api.playlists().map(::playlistItem)
        parentId.startsWith("album:") || parentId.startsWith("playlist:") -> tracksOf(parentId).map { browseTrackItem(it, parentId) }
        parentId.startsWith("artist:") -> api.artistAlbums(parentId.removePrefix("artist:")).map(::albumItem)
        else -> emptyList()
    }

    override fun search(query: String): List<MediaItem> {
        if (query.isBlank()) return emptyList()
        return api.search(query).map {
            when (it.type) {
                "artist" -> artistItem(it)
                "album" -> albumItem(it)
                else -> queueItem(it)
            }
        }
    }

    override fun resolve(items: List<MediaItem>): Pair<List<MediaItem>, Int>? {
        val first = items.firstOrNull() ?: return null
        first.requestMetadata.searchQuery?.let { query ->
            val found = api.search(query)
            val songs = found.filter { it.type == "track" }.ifEmpty {
                // "Play <album or artist>": the first matching album.
                val album = found.firstOrNull { it.type == "album" }
                    ?: found.firstOrNull { it.type == "artist" }?.let { api.artistAlbums(it.id).firstOrNull() }
                album?.let { api.albumTracks(it.id) } ?: emptyList()
            }
            return songs.map(::queueItem).takeIf { it.isNotEmpty() }?.let { it to 0 }
        }
        val id = first.mediaId
        return when {
            id.startsWith("track:") -> {
                val (trackId, parent) = id.removePrefix("track:").split(":", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
                val tracks = if (parent.isNotEmpty()) tracksOf(parent) else api.tracks(listOf(trackId))
                val queue = tracks.map(::queueItem)
                queue to queue.indexOfFirst { it.mediaId == trackId }.coerceAtLeast(0)
            }
            id.startsWith("album:") || id.startsWith("playlist:") -> tracksOf(id).map(::queueItem) to 0
            id.startsWith(MusicLibrary.SHUFFLE_PREFIX) -> randomTracks(id.removePrefix(MusicLibrary.SHUFFLE_PREFIX)) to 0
            else -> {
                // Plain track ids (search results, or a queue restored by the system).
                val byId = api.tracks(items.map { it.mediaId }).associateBy { it.id }
                items.mapNotNull { byId[it.mediaId]?.let(::queueItem) } to 0
            }
        }.takeIf { it.first.isNotEmpty() }
    }

    override fun randomTracks(libraryId: String): List<MediaItem> = api.randomTracks(libraryId).map(::queueItem)

    override fun imageRequest(itemId: String): Pair<String, Map<String, String>>? =
        if (!isConfigured) null else api.imageUrl(itemId) to api.headers()

    private fun tracksOf(parentId: String): List<PlexMusicApi.Entry> = when {
        parentId.startsWith("album:") -> api.albumTracks(parentId.removePrefix("album:"))
        parentId.startsWith("playlist:") -> api.playlistTracks(parentId.removePrefix("playlist:"))
        else -> emptyList()
    }

    private fun httpGet(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        api.headers().forEach { (name, value) -> conn.setRequestProperty(name, value) }
        conn.connectTimeout = 8000
        conn.readTimeout = 15000
        try {
            if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode} for ${URL(url).path}")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    // --- MediaItems ---

    private fun folder(id: String, title: String) = MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED).build()
        )
        .build()

    private fun shuffleItem(library: PlexMusicApi.Library) = MediaItem.Builder()
        .setMediaId(MusicLibrary.SHUFFLE_PREFIX + library.id)
        .setMediaMetadata(
            MediaMetadata.Builder().setTitle(context.getString(R.string.auto_shuffle_library, library.title))
                .setIsBrowsable(false).setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST).build()
        )
        .build()

    private fun browsable(id: String, e: PlexMusicApi.Entry, type: Int, playable: Boolean) = MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(e.title)
                .setArtist(e.artist)
                .setArtworkUri(ArtworkProvider.uri(context, e.id))
                .setIsBrowsable(true).setIsPlayable(playable)
                .setMediaType(type)
                .build()
        )
        .build()

    private fun albumItem(e: PlexMusicApi.Entry) = browsable("album:${e.id}", e, MediaMetadata.MEDIA_TYPE_ALBUM, playable = true)

    private fun artistItem(e: PlexMusicApi.Entry) = browsable("artist:${e.id}", e, MediaMetadata.MEDIA_TYPE_ARTIST, playable = false)

    private fun playlistItem(e: PlexMusicApi.Entry) = browsable("playlist:${e.id}", e, MediaMetadata.MEDIA_TYPE_PLAYLIST, playable = true)

    private fun browseTrackItem(e: PlexMusicApi.Entry, parentId: String) =
        queueItem(e).buildUpon().setMediaId("track:${e.id}:$parentId").build()

    /** A playable track, shaped like the queues the app builds (see toNativeTrack). */
    private fun queueItem(e: PlexMusicApi.Entry): MediaItem {
        val albumId = e.albumId.ifEmpty { e.id }
        val uri = Uri.parse(api.streamUrl(e, maxBitrate))
        // AudioTrack JSON: lets the app adopt a queue started from the car (and stream the file directly).
        val track = JSONObject()
            .put("id", e.id)
            .put("name", e.title)
            .put("artist", e.artist)
            .put("albumId", albumId)
            .put("albumName", e.album)
            .put("duration", e.durationMs / 1000.0)
            .put("indexNumber", e.index)
        e.thumb?.let { track.put("artwork", it) }
        e.partKey?.let { track.put("streamRef", it) }
        return MediaItem.Builder()
            .setMediaId(e.id)
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(e.title)
                    .setArtist(e.artist)
                    .setAlbumTitle(e.album)
                    .setArtworkUri(ArtworkProvider.uri(context, albumId))
                    .setIsBrowsable(false).setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .setExtras(Bundle().apply { putString(TRACK_EXTRA, track.toString()) })
                    .build()
            )
            .build()
    }
}
