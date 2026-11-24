package cloud.valgrind.vela

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/**
 * Plex music requests for Android Auto, without Android types so it can be
 * unit-tested: [fetch] gets a full URL (token in the headers it adds) and
 * returns the JSON body. Mirrors src/backends/plex/music.ts.
 */
class PlexMusicApi(
    private val server: String,
    private val token: String,
    private val clientId: String,
    private val fetch: (url: String) -> String,
) {
    data class Library(val id: String, val title: String)

    data class Entry(
        val id: String,
        val type: String,
        val title: String,
        val artist: String = "",
        val album: String = "",
        val albumId: String = "",
        val durationMs: Long = 0,
        val index: Int = 0,
        /** Part key of a track: its file. */
        val partKey: String? = null,
        val thumb: String? = null,
    )

    companion object {
        private const val PAGE = 300
        private const val TYPE_ARTIST = 8
        private const val TYPE_ALBUM = 9
        private const val TYPE_TRACK = 10
        /** Below this the user capped music quality: convert (PMS copies files already under it). */
        private const val CAP_THRESHOLD_BPS = 10_000_000L
        /** Same as DEVICE_CONTAINERS in audioPlayerService.ts (ExoPlayer + FFmpeg). */
        private val DIRECT_EXTENSIONS = setOf("opus", "webm", "mp3", "aac", "m4a", "m4b", "flac", "webma", "wav", "ogg")
        private val MUSIC_TYPES = setOf("artist", "album", "track")

        private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    }

    fun musicLibraries(): List<Library> = directories(get("/library/sections"))
        .filter { it.optString("type") == "artist" }
        .map { Library(it.getString("key"), it.optString("title")) }

    fun latestAlbums(): List<Entry> = musicLibraries()
        .flatMap { list("/library/sections/${it.id}/all", "type" to "$TYPE_ALBUM", "sort" to "addedAt:desc", size = 50) }
        .take(50)

    fun albums(): List<Entry> = musicLibraries().flatMap { list("/library/sections/${it.id}/all", "type" to "$TYPE_ALBUM", "sort" to "titleSort") }

    fun artists(): List<Entry> = musicLibraries().flatMap { list("/library/sections/${it.id}/all", "type" to "$TYPE_ARTIST", "sort" to "titleSort") }

    fun playlists(): List<Entry> = list("/playlists", "playlistType" to "audio")

    fun artistAlbums(artistId: String): List<Entry> = list("/library/metadata/$artistId/children")

    fun albumTracks(albumId: String): List<Entry> = list("/library/metadata/$albumId/children")

    fun playlistTracks(playlistId: String): List<Entry> = list("/playlists/$playlistId/items")

    fun tracks(ids: List<String>): List<Entry> =
        if (ids.isEmpty()) emptyList() else metadata(get("/library/metadata/${ids.joinToString(",") { enc(it) }}"))

    fun randomTracks(libraryId: String): List<Entry> =
        list("/library/sections/$libraryId/all", "type" to "$TYPE_TRACK", "sort" to "random", size = 100)

    /** Artists, albums and songs matching [query]. */
    fun search(query: String, limit: Int = 30): List<Entry> {
        val hubs = JSONObject(get("/hubs/search", "query" to query, "limit" to "$limit")).optJSONObject("MediaContainer")?.optJSONArray("Hub")
            ?: return emptyList()
        return (0 until hubs.length()).flatMap { i -> metadata(hubs.getJSONObject(i)) }.filter { it.type in MUSIC_TYPES }
    }

    /** The file itself when ExoPlayer plays it and no cap is set; otherwise the universal conversion. */
    fun streamUrl(track: Entry, maxBitrate: Long): String {
        val extension = track.partKey?.substringBefore('?')?.substringAfterLast('.', "")?.lowercase()
        if (track.partKey != null && maxBitrate >= CAP_THRESHOLD_BPS && extension in DIRECT_EXTENSIONS) {
            return "$server${track.partKey}?X-Plex-Token=${enc(token)}"
        }
        val params = listOf(
            "path" to "/library/metadata/${track.id}",
            "protocol" to "http",
            "directPlay" to "0",
            "directStream" to "1",
            "musicBitrate" to "${maxBitrate / 1000}",
            "X-Plex-Client-Identifier" to clientId,
            "X-Plex-Product" to "Vela",
            "X-Plex-Client-Profile-Name" to "Generic",
            "X-Plex-Client-Profile-Extra" to "add-transcode-target(type=musicProfile&context=streaming&protocol=http&container=mp3&audioCodec=mp3)",
            "X-Plex-Token" to token,
        )
        return "$server/music/:/transcode/universal/start.mp3?" + params.joinToString("&") { "${it.first}=${enc(it.second)}" }
    }

    /** Cover of an item, resized by PMS (the URL carries the token). */
    fun imageUrl(itemId: String): String =
        "$server/photo/:/transcode?url=${enc("/library/metadata/$itemId/thumb")}&width=400&height=400&minSize=1&upscale=1&X-Plex-Token=${enc(token)}"

    /** Headers for every request; the token also goes here, not in URLs that get logged. */
    fun headers(): Map<String, String> = mapOf(
        "Accept" to "application/json",
        "X-Plex-Token" to token,
        "X-Plex-Client-Identifier" to clientId,
        "X-Plex-Product" to "Vela",
    )

    // --- JSON ---

    private fun list(path: String, vararg params: Pair<String, String>, size: Int = PAGE): List<Entry> =
        metadata(get(path, *params, "X-Plex-Container-Start" to "0", "X-Plex-Container-Size" to "$size"))

    private fun get(path: String, vararg params: Pair<String, String>): String {
        val query = params.joinToString("&") { "${it.first}=${enc(it.second)}" }
        return fetch(if (query.isEmpty()) "$server$path" else "$server$path?$query")
    }

    private fun container(json: String): JSONObject? = JSONObject(json).optJSONObject("MediaContainer")

    private fun directories(json: String): List<JSONObject> = objects(container(json)?.optJSONArray("Directory"))

    private fun metadata(json: String): List<Entry> = container(json)?.let(::metadata) ?: emptyList()

    private fun metadata(container: JSONObject): List<Entry> = objects(container.optJSONArray("Metadata")).map(::entry)

    private fun objects(array: JSONArray?): List<JSONObject> = array?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } } ?: emptyList()

    private fun entry(o: JSONObject): Entry {
        val type = o.optString("type")
        val part = o.optJSONArray("Media")?.optJSONObject(0)?.optJSONArray("Part")?.optJSONObject(0)
        return Entry(
            id = o.getString("ratingKey"),
            type = type,
            title = o.optString("title"),
            // Tracks: performer (originalTitle) else album artist; albums: their artist.
            artist = o.optString("originalTitle").ifEmpty { o.optString(if (type == "track") "grandparentTitle" else "parentTitle") },
            album = if (type == "track") o.optString("parentTitle") else "",
            albumId = if (type == "track") o.optString("parentRatingKey") else "",
            durationMs = o.optLong("duration"),
            index = o.optInt("index"),
            partKey = part?.optString("key")?.ifEmpty { null },
            thumb = (if (type == "track") o.optString("parentThumb") else o.optString("thumb")).ifEmpty { null },
        )
    }
}
