# Plex fixtures

Real responses from a Plex Media Server 1.43.5 (JSON, `Accept: application/json`),
captured read-only (GET only) on 2026-11-22 and **anonymised** before commit:

- titles, sort titles, summaries, taglines, studios, people, roles, slugs, GUIDs,
  file paths, library names, image alt texts and external image URLs are replaced
  with stable placeholders (`title 12`, `tag 34`, `/media/item-3.mkv`…);
- stream `extendedDisplayTitle` is replaced with `displayTitle` (release names);
- machine identifiers and section UUIDs are hashed; no token or host is present.

Ids (`ratingKey`, `librarySectionID`, stream/part ids), types, technical media
info (codecs, profiles, HDR, channels, languages), markers, chapters, genres,
countries and timestamps are kept so mappers can be tested against the real shape.

| File | Request |
|---|---|
| `identity.json` | `GET /identity` |
| `sections.json` | `GET /library/sections` |
| `movies-page.json` | `GET /library/sections/{movies}/all?type=1&sort=titleSort:asc` (3 items) |
| `movies-unwatched.json` | same with `unwatched=1` |
| `movies-recent.json` | `GET /library/sections/{movies}/recentlyAdded` |
| `movie-genres.json` | `GET /library/sections/{movies}/genre` |
| `movie-first-character.json` | `GET /library/sections/{movies}/firstCharacter` |
| `movie-detail.json` | `GET /library/metadata/{id}?includeMarkers=1&includeChapters=1` (credits markers, chapters) |
| `movie-similar.json` | `GET /library/metadata/{id}/similar` |
| `shows-page.json` | `GET /library/sections/{shows}/all?type=2` |
| `show-detail.json` | `GET /library/metadata/{show}` |
| `show-seasons.json` | `GET /library/metadata/{show}/children` |
| `season-episodes.json` | `GET /library/metadata/{season}/children` |
| `show-all-leaves.json` | `GET /library/metadata/{show}/allLeaves` |
| `episode-detail.json` | episode with markers/chapters, unwatched (no `viewOffset`) |
| `episode-inprogress-{0,1,2}.json` | in-progress episodes: intro + credits markers, HEVC, 2 audio tracks, embedded SRT |
| `hub-continue-watching.json` | `GET /hubs/home/continueWatching` |
| `hub-on-deck.json` | `GET /hubs/home/onDeck` |
| `search.json` | `GET /hubs/search?query=the` |
| `decision.json` | `GET /video/:/transcode/universal/decision` (HEVC 4K → H.264 720p HLS, code 1001), body is the `MediaContainer` |

Captures after 2026-11-22 use the managed Plex Home profile dedicated to tests,
never the owner account.

Do not add fixtures from a personal server without running the same anonymisation.
Write endpoints (`/:/timeline`, `/:/scrobble`, `PUT /library/parts`, transcoder)
must never be exercised against a personal server.
