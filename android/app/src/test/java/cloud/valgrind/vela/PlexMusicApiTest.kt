package cloud.valgrind.vela

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlexMusicApiTest {

    private val requested = mutableListOf<String>()

    private val answers = mapOf(
        "/library/sections" to """{"MediaContainer":{"Directory":[{"key":"1","type":"movie","title":"Films"},{"key":"10","type":"artist","title":"Musique"}]}}""",
        "/library/metadata/61/children" to """{"MediaContainer":{"Metadata":[
            {"ratingKey":"7","type":"track","title":"Song","grandparentTitle":"Band","originalTitle":"Guest","parentTitle":"Album","parentRatingKey":"61","parentThumb":"/library/metadata/61/thumb/1","index":2,"duration":180000,
             "Media":[{"Part":[{"key":"/library/parts/70/1/file.mp3"}]}]},
            {"ratingKey":"8","type":"track","title":"Lossless","grandparentTitle":"Band","parentTitle":"Album","parentRatingKey":"61","index":3,"duration":200000,
             "Media":[{"Part":[{"key":"/library/parts/80/1/file.dsf"}]}]}]}}""",
        "/hubs/search" to """{"MediaContainer":{"Hub":[
            {"type":"artist","Metadata":[{"ratingKey":"5","type":"artist","title":"Band"}]},
            {"type":"album","Metadata":[{"ratingKey":"61","type":"album","title":"Album","parentTitle":"Band"}]},
            {"type":"movie","Metadata":[{"ratingKey":"99","type":"movie","title":"Film"}]}]}}""",
    )

    private val api = PlexMusicApi("https://pms.test", "tok", "client-1") { url ->
        requested.add(url)
        val path = url.removePrefix("https://pms.test").substringBefore('?')
        answers[path] ?: """{"MediaContainer":{}}"""
    }

    @Test fun listsOnlyMusicLibraries() {
        assertEquals(listOf(PlexMusicApi.Library("10", "Musique")), api.musicLibraries())
    }

    @Test fun readsTracksWithTheirFileAndArtwork() {
        val track = api.albumTracks("61").first()
        assertEquals("7", track.id)
        assertEquals("Song", track.title)
        assertEquals("Guest", track.artist)
        assertEquals("Album", track.album)
        assertEquals("61", track.albumId)
        assertEquals(180_000L, track.durationMs)
        assertEquals(2, track.index)
        assertEquals("/library/parts/70/1/file.mp3", track.partKey)
        assertEquals("/library/metadata/61/thumb/1", track.thumb)
    }

    @Test fun streamsPlayableFilesDirectlyAndConvertsTheRest() {
        val (mp3, dsf) = api.albumTracks("61")
        assertEquals("https://pms.test/library/parts/70/1/file.mp3?X-Plex-Token=tok", api.streamUrl(mp3, 140_000_000))
        assertTrue(api.streamUrl(dsf, 140_000_000).startsWith("https://pms.test/music/:/transcode/universal/start.mp3?path=%2Flibrary%2Fmetadata%2F8"))
        assertTrue(api.streamUrl(mp3, 320_000).contains("musicBitrate=320"))
    }

    @Test fun searchKeepsMusicResults() {
        assertEquals(listOf("artist", "album"), api.search("band").map { it.type })
        assertTrue(requested.last().contains("query=band"))
    }

    @Test fun sendsTheTokenAndPagesLists() {
        api.albums()
        val url = requested.last()
        assertTrue(url.contains("/library/sections/10/all?") && url.contains("type=9"))
        assertTrue(url.contains("X-Plex-Container-Start=0") && url.contains("X-Plex-Container-Size=300"))
    }

    @Test fun imagesComeResized() {
        assertEquals(
            "https://pms.test/photo/:/transcode?url=%2Flibrary%2Fmetadata%2F61%2Fthumb&width=400&height=400&minSize=1&upscale=1&X-Plex-Token=tok",
            api.imageUrl("61"),
        )
    }
}
