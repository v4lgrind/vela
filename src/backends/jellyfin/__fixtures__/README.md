# Jellyfin fixtures

Responses captured on 2026-11-22 from the local fake Jellyfin server used for UI
verification (`~/.local/share/vela-dev/server.mjs`, fictional titles only).

Caveat: that server is a hand-written approximation of Jellyfin 10.11, not the
real thing. Field names follow `BaseItemDto`, but some fields a real server
returns are missing (e.g. `ServerId`, `Etag`, `ChannelId`, full `UserData`).
Mapper tests should type fixtures against the SDK (`BaseItemDto`,
`PlaybackInfoResponse`) so `vue-tsc` catches shape drift, and real-server
captures can replace these later (read-only, anonymised like the Plex ones).

| File | Request |
|---|---|
| `system-info-public.json` | `GET /System/Info/Public` |
| `user-views.json` | `GET /UserViews` |
| `movies-page.json` | `GET /Items?parentId={movies}&recursive=true&sortBy=SortName&limit=3` |
| `shows-page.json` | `GET /Items?parentId={shows}&includeItemTypes=Series&limit=3` |
| `movie-detail.json` | `GET /Items?ids={id}&fields=MediaStreams,UserData,People,…` |
| `show-seasons.json` | `GET /Items?parentId={series}&includeItemTypes=Season` |
| `season-episodes.json` | `GET /Items?parentId={season}&includeItemTypes=Episode` |
| `resume.json` | `GET /UserItems/Resume` |
| `next-up.json` | `GET /Shows/NextUp` |
| `latest-movies.json` | `GET /Items/Latest?parentId={movies}` |
| `search.json` | `GET /Items?searchTerm=le` |
| `similar.json` | `GET /Items/{id}/Similar` |
| `playback-info.json` | `POST /Items/{id}/PlaybackInfo` |
