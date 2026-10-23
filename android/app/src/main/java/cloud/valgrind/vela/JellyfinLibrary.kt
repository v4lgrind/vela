package cloud.valgrind.vela

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * The music library as seen from Android Auto: a small Jellyfin client that
 * builds the browse tree and playable queues natively, so it works while the
 * app (and its WebView) isn't running. The WebView pushes the server and
 * credentials through [NativeAudioPlugin.setLibraryConfig].
 *
 * Media ids: `root`, `shuffle:<libraryId>`, `latest`, `albums`, `artists`, `playlists`,
 * `album:<id>`, `artist:<id>`, `playlist:<id>`, and for browse tracks
 * `track:<trackId>:<parent>` so a pick can queue the rest of its parent.
 * Queued items use the plain track id, like the queues the app builds.
 */
class JellyfinLibrary(private val context: Context) {

    companion object {
        const val ROOT = "root"
        /** `shuffle:<libraryId>`: random picks from a music library; MusicService tops the queue up. */
        const val SHUFFLE_PREFIX = "shuffle:"
        private const val PREFS = "music_library"
        private const val PAGE = 300

        fun saveConfig(context: Context, serverUrl: String, token: String, userId: String, maxBitrate: Long) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("serverUrl", serverUrl.trimEnd('/'))
                .putString("token", token)
                .putString("userId", userId)
                .putLong("maxBitrate", maxBitrate)
                .apply()
        }
    }

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val server get() = prefs.getString("serverUrl", "") ?: ""
    private val token get() = prefs.getString("token", "") ?: ""
    private val userId get() = prefs.getString("userId", "") ?: ""

    val isConfigured get() = server.isNotEmpty() && token.isNotEmpty() && userId.isNotEmpty()

    // --- Browse tree ---

    fun root(): MediaItem = folder(ROOT, "Vela")

    /** Blocking (network). Children of a browsable [parentId]. */
    fun children(parentId: String): List<MediaItem> = when {
        // Audiobooks often live in a "music" library too: one shuffle entry per library.
        parentId == ROOT -> musicLibraries().map(::shuffleItem) + listOf(
            folder("latest", context.getString(R.string.auto_latest)),
            folder("albums", context.getString(R.string.auto_albums)),
            folder("artists", context.getString(R.string.auto_artists)),
            folder("playlists", context.getString(R.string.auto_playlists)),
        )
        parentId == "latest" -> latestAlbums().map(::albumItem)
        parentId == "albums" -> items("IncludeItemTypes" to "MusicAlbum", "SortBy" to "SortName").map(::albumItem)
        parentId == "artists" -> artists().map(::artistItem)
        parentId == "playlists" -> items("IncludeItemTypes" to "Playlist", "MediaTypes" to "Audio", "SortBy" to "SortName").map(::playlistItem)
        parentId.startsWith("album:") || parentId.startsWith("playlist:") ->
            tracksOf(parentId).map { browseTrackItem(it, parentId) }
        parentId.startsWith("artist:") ->
            items("IncludeItemTypes" to "MusicAlbum", "AlbumArtistIds" to parentId.removePrefix("artist:"),
                "SortBy" to "ProductionYear,SortName", "SortOrder" to "Descending").map(::albumItem)
        else -> emptyList()
    }

    /** Blocking (network). Artists, albums and songs matching [query]. */
    fun search(query: String): List<MediaItem> {
        if (query.isBlank()) return emptyList()
        return items("SearchTerm" to query, "IncludeItemTypes" to "MusicArtist,MusicAlbum,Audio", "Limit" to "60")
            .mapNotNull {
                when (it.optString("Type")) {
                    "MusicArtist" -> artistItem(it)
                    "MusicAlbum" -> albumItem(it)
                    "Audio" -> queueItem(it)
                    else -> null
                }
            }
    }

    // --- Playback ---

    /**
     * Blocking (network). Turns what a car picked into a queue and its start
     * index: a browse track plays its whole album/playlist from that track, an
     * album or playlist plays from the top, a voice query plays its matches.
     */
    fun resolve(items: List<MediaItem>): Pair<List<MediaItem>, Int>? {
        val first = items.firstOrNull() ?: return null
        first.requestMetadata.searchQuery?.let { query ->
            val songs = items("SearchTerm" to query, "IncludeItemTypes" to "Audio", "Limit" to "50")
                .ifEmpty { tracksOfFirstMatch(query) }
            return songs.map(::queueItem).takeIf { it.isNotEmpty() }?.let { it to 0 }
        }
        val id = first.mediaId
        return when {
            id.startsWith("track:") -> {
                val (trackId, parent) = id.removePrefix("track:").split(":", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
                val tracks = if (parent.isNotEmpty()) tracksOf(parent) else items("Ids" to trackId)
                val queue = tracks.map(::queueItem)
                queue to queue.indexOfFirst { it.mediaId == trackId }.coerceAtLeast(0)
            }
            id.startsWith("album:") || id.startsWith("playlist:") -> tracksOf(id).map(::queueItem) to 0
            id.startsWith(SHUFFLE_PREFIX) -> randomTracks(id.removePrefix(SHUFFLE_PREFIX)) to 0
            else -> {
                // Plain track ids (search results, or a queue restored by the system).
                val byId = items("Ids" to items.joinToString(",") { it.mediaId }).associateBy { it.getString("Id") }
                items.mapNotNull { byId[it.mediaId]?.let(::queueItem) } to 0
            }
        }.takeIf { it.first.isNotEmpty() }
    }

    /** Blocking (network). Random songs from a music library. */
    fun randomTracks(libraryId: String): List<MediaItem> =
        items("ParentId" to libraryId, "IncludeItemTypes" to "Audio", "SortBy" to "Random").map(::queueItem)

    // --- Jellyfin queries ---

    // Items/Latest returns nothing without a library id; sort by date added instead.
    private fun musicLibraries(): List<JSONObject> =
        page(JSONObject(get("/Users/$userId/Views", emptyMap())))
            .filter { it.optString("CollectionType") == "music" }

    private fun latestAlbums(): List<JSONObject> =
        items("IncludeItemTypes" to "MusicAlbum", "SortBy" to "DateCreated", "SortOrder" to "Descending", "Limit" to "50")

    private fun artists(): List<JSONObject> =
        page(JSONObject(get("/Artists/AlbumArtists", mapOf("userId" to userId, "SortBy" to "SortName", "Limit" to "$PAGE"))))

    private fun tracksOf(parentId: String): List<JSONObject> = when {
        parentId.startsWith("album:") ->
            items("ParentId" to parentId.removePrefix("album:"), "IncludeItemTypes" to "Audio",
                "SortBy" to "ParentIndexNumber,IndexNumber,SortName")
        parentId.startsWith("playlist:") -> {
            val id = parentId.removePrefix("playlist:")
            page(JSONObject(get("/Playlists/$id/Items", mapOf("userId" to userId, "Limit" to "$PAGE"))))
        }
        else -> emptyList()
    }

    /** "Play <album or artist> on Jellyfin": the first album matching [query]. */
    private fun tracksOfFirstMatch(query: String): List<JSONObject> {
        val album = items("SearchTerm" to query, "IncludeItemTypes" to "MusicAlbum", "Limit" to "1").firstOrNull()
            ?: items("SearchTerm" to query, "IncludeItemTypes" to "MusicArtist", "Limit" to "1").firstOrNull()?.let { artist ->
                items("IncludeItemTypes" to "MusicAlbum", "AlbumArtistIds" to artist.getString("Id"), "Limit" to "1").firstOrNull()
            }
            ?: return emptyList()
        return tracksOf("album:${album.getString("Id")}")
    }

    private fun items(vararg params: Pair<String, String>): List<JSONObject> {
        val query = mutableMapOf("Recursive" to "true", "Limit" to "$PAGE")
        query.putAll(params)
        return page(JSONObject(get("/Users/$userId/Items", query)))
    }

    private fun page(json: JSONObject): List<JSONObject> {
        val arr = json.optJSONArray("Items") ?: return emptyList()
        return (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    private fun get(path: String, params: Map<String, String>): String {
        val query = params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
        val conn = URL("$server$path?$query").openConnection() as HttpURLConnection
        conn.setRequestProperty("Authorization", "MediaBrowser Token=\"$token\"")
        conn.connectTimeout = 8000
        conn.readTimeout = 15000
        try {
            if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode} for $path")
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

    private fun shuffleItem(library: JSONObject) = MediaItem.Builder()
        .setMediaId(SHUFFLE_PREFIX + library.getString("Id"))
        .setMediaMetadata(
            MediaMetadata.Builder().setTitle(context.getString(R.string.auto_shuffle_library, library.optString("Name")))
                .setIsBrowsable(false).setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST).build()
        )
        .build()

    private fun albumItem(o: JSONObject) = MediaItem.Builder()
        .setMediaId("album:${o.getString("Id")}")
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(o.optString("Name"))
                .setArtist(artistOf(o))
                .setArtworkUri(ArtworkProvider.uri(context, o.getString("Id")))
                .setIsBrowsable(true).setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_ALBUM)
                .build()
        )
        .build()

    private fun artistItem(o: JSONObject) = MediaItem.Builder()
        .setMediaId("artist:${o.getString("Id")}")
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(o.optString("Name"))
                .setArtworkUri(ArtworkProvider.uri(context, o.getString("Id")))
                .setIsBrowsable(true).setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_ARTIST)
                .build()
        )
        .build()

    private fun playlistItem(o: JSONObject) = MediaItem.Builder()
        .setMediaId("playlist:${o.getString("Id")}")
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(o.optString("Name"))
                .setArtworkUri(ArtworkProvider.uri(context, o.getString("Id")))
                .setIsBrowsable(true).setIsPlayable(true)
                .setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST)
                .build()
        )
        .build()

    private fun browseTrackItem(o: JSONObject, parentId: String) =
        queueItem(o).buildUpon().setMediaId("track:${o.getString("Id")}:$parentId").build()

    /** A playable track, shaped like the queues the app builds (see toNativeTrack). */
    private fun queueItem(o: JSONObject): MediaItem {
        val id = o.getString("Id")
        val albumId = o.optString("AlbumId").ifEmpty { o.optString("ParentId").ifEmpty { id } }
        val uri = Uri.parse(streamUrl(id))
        // AudioTrack JSON: lets the app adopt a queue started from the car.
        val track = JSONObject()
            .put("id", id)
            .put("name", o.optString("Name"))
            .put("artist", artistOf(o))
            .put("albumId", albumId)
            .put("albumName", o.optString("Album"))
            .put("duration", o.optLong("RunTimeTicks") / 10_000_000.0)
            .put("indexNumber", o.optInt("IndexNumber"))
        return MediaItem.Builder()
            .setMediaId(id)
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(o.optString("Name"))
                    .setArtist(artistOf(o))
                    .setAlbumTitle(o.optString("Album"))
                    .setArtworkUri(ArtworkProvider.uri(context, albumId))
                    .setIsBrowsable(false).setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .setExtras(Bundle().apply { putString(TRACK_EXTRA, track.toString()) })
                    .build()
            )
            .build()
    }

    private fun artistOf(o: JSONObject): String =
        o.optString("AlbumArtist").ifEmpty {
            o.optJSONArray("Artists")?.let { a -> (0 until a.length()).joinToString(", ") { a.getString(it) } } ?: ""
        }

    /** Same request as audioPlayerService.buildStreamUrl for the native engine. */
    private fun streamUrl(id: String): String {
        val params = mapOf(
            "userId" to userId,
            "ApiKey" to token,
            "MaxStreamingBitrate" to prefs.getLong("maxBitrate", 140_000_000).toString(),
            "Container" to "opus,webm|opus,mp3,aac,m4a|aac,m4a|alac,m4b|aac,flac,webma,webm|webma,wav,ogg",
            "TranscodingContainer" to "mp3",
            "TranscodingProtocol" to "http",
            "AudioCodec" to "mp3",
        )
        return "$server/Audio/$id/universal?" + params.entries.joinToString("&") {
            "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}"
        }
    }

    /** For [ArtworkProvider]: the image URL and auth header of [itemId]. */
    fun imageRequest(itemId: String): Pair<String, String>? =
        if (!isConfigured) null
        else "$server/Items/$itemId/Images/Primary?maxWidth=400&quality=90" to "MediaBrowser Token=\"$token\""
}
