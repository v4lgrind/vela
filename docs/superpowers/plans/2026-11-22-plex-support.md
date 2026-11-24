# Plan: multi-backend Vela (Jellyfin + Plex)

Status: v2 approved in principle, decisions recorded 2026-11-22 (see "Decisions").
Replaces the "Plex → Jellyfin-shaped DTO adapter" draft.

## Goal

Vela becomes a media client with **its own domain model**. Jellyfin and Plex are
two interchangeable backends implementing the same ports. No page, composable,
store or offline record knows which server it talks to. Jellyfin behaviour must
not regress at any step.

## Why the first draft was rejected

Draft v1 mapped Plex responses into Jellyfin `BaseItemDto`s. It was cheap, but:

- Jellyfin's wire format (PascalCase, 100 ns ticks, `ImageTags`, `UserData`,
  `DeviceProfile`) would stay the app's internal language forever; Plex would be
  a second-class citizen squeezed into it.
- Plex concepts that do not fit (opaque stream ids + `PUT /library/parts`,
  per-server tokens, several connection URLs, BIF trickplay, LRC lyrics, markers)
  would leak through hacks (e.g. "`MediaStream.Index` = Plex stream id").
- The playback fallbacks are expressed by editing a Jellyfin `DeviceProfile`;
  Plex would have to reverse-engineer intent from a Jellyfin profile.

## Current state (verified)

| Layer | Coupling to Jellyfin |
|---|---|
| Pages / utils | Read `BaseItemDto` fields directly: `Id` ×224, `Type` ×139, `UserData` ×64, `MediaStreams` ×30, `RunTimeTicks` ×23, `TranscodingUrl` ×22… `ItemDetailsPage.vue` ≈250 refs. SDK types imported in `MediaList.vue`, `LibrariesPage.vue`, `detailMeta.ts`, `lyrics.ts`. |
| `store/jellyfin-store.ts` (787 l.) | Auth, Quick Connect, saved servers, tokens, ~35 data methods, `getImageUrl` (26 call sites), home cache. |
| Raw `fetch` outside the store | `usePlayerSession` (PlaybackInfo + DeviceProfile, Sessions/Playing*, ActiveEncodings), `useWebPlayer` (rebuilds `master.m3u8`), `useSkipIntro` (MediaSegments), `useStreamInfo` (Sessions), `useNativePlayer` (Trickplay tiles), `subtitleTracks.ts`, `playbackUrl.ts`, `audioPlayerService` (`/Audio/universal`, Sessions), `downloadService` + `download-store` (Download, PlaybackInfo, subtitles, segments, images), `syncService` (UserData). |
| Playback strategy | Fallbacks (`forceTranscode`, `stripHevc`, `transcodeAudio`, PGS burn-in, bitrate cap, resume-with-transcode bug workaround) are encoded as edits to `nativeAndroidDeviceProfile` in `constants.ts`. |
| Persistence | IndexedDB `DownloadedMedia.jellyfinItem` (raw DTO, 26 uses), `metadata-cache-store` (`CachedItem` = DTO subset, persisted), token keys `jellyfin_token_${userId}`, `SavedServer` without kind. |
| Native (Kotlin) | `JellyfinLibrary.kt` (Android Auto browse tree, its own HTTP client), `ArtworkProvider.kt`, `TrickplayThumbnails.kt` (Jellyfin tiles), `CastPlugin.kt` (Jellyfin Cast receiver). `NativeVideoPlugin` / `DownloadPlugin` are generic (URL + headers). |
| Already neutral | `audio-player-store` `AudioTrack`, `codecDetection` device capabilities, player UI composables (state refs), offline detection. |

Note: `node_modules` is not installed in this worktree; run `npm ci` before Phase 0.

## Architecture

```
src/
  domain/                    pure TS: no Vue, no fetch, no backend import
    media.ts                 MediaItem union, Library, MediaVersion, streams, UserState, ImageRef
    query.ts                 LibraryQuery, Page<T>, HomeSections
    playback.ts              PlaybackRequest, PlaybackPlan, PlaybackReport, Marker, Chapter, Trickplay
    audio.ts                 AudioStreamRequest, Lyrics
    download.ts              DownloadRequest, DownloadPlan
    server.ts                ServerKind, ServerConnection, Capabilities, AuthFlow
    backend.ts               MediaBackend port (catalog, userData, playback, music, downloads)
    logic/                   pure rules moved from utils: watch progress, next episode,
                             track preference (language), title building, detail meta
  backends/
    jellyfin/                client, auth, mappers, catalog, playback (DeviceProfile lives here),
                             reporting, downloads, index.ts → JellyfinBackend
    plex/                    client (X-Plex-* headers), auth (plex.tv pins + resources +
                             connection probing), mappers, catalog, playback (universal
                             decision + client profile), reporting (timeline), downloads,
                             index.ts → PlexBackend
    registry.ts              createBackend(connection): MediaBackend
  store/
    session-store.ts         servers, active connection, secure tokens, backend instance
    …                        other stores consume domain types only
  pages/, components/, composables/   domain types + session-store only
```

**Dependency rule**: `domain` imports nothing from the app; `backends/*` import
`domain` only; everything else imports `domain` and `session-store`, never
`backends/*` or `@jellyfin/sdk`. Enforced by an `architecture.test.ts` in the
same style as the existing `i18n/hardcodedText.test.ts` (no ESLint in the repo).

### Domain model (sketch)

```ts
type ItemId = string;           // opaque, unique within one server
type ImageRef = string;          // opaque, produced by the backend

interface UserState {
  played: boolean; playCount: number; favorite: boolean;
  resumePositionMs?: number; lastPlayedAt?: string; unplayedCount?: number;
}
interface Images { poster?: ImageRef; backdrop?: ImageRef; thumb?: ImageRef; logo?: ImageRef }

interface ItemBase {
  id: ItemId; kind: ItemKind; title: string; sortTitle?: string;
  overview?: string; year?: number; premiereDate?: string; rating?: number;
  genres: string[]; studios: string[]; durationMs?: number;
  images: Images; user: UserState; libraryId?: string;
}
type MediaItem =
  | Movie | Series | Season | Episode | Collection
  | Artist | Album | Track | Playlist | Person;
interface Episode extends ItemBase {
  kind: 'episode'; seriesId: ItemId; seriesTitle: string;
  seasonId: ItemId; seasonNumber?: number; episodeNumber?: number;
  versions: MediaVersion[]; people: Credit[];
}
interface Track extends ItemBase {
  kind: 'track'; albumId?: ItemId; albumTitle?: string; artists: string[];
  albumArtist?: string; trackNumber?: number; discNumber?: number; hasLyrics: boolean;
}

interface MediaVersion {
  id: string; container?: string; sizeBytes?: number; bitrate?: number; durationMs?: number;
  video: VideoStream[]; audio: AudioStream[]; subtitles: SubtitleStream[];
}
interface AudioStream {
  id: string;                      // opaque: Jellyfin Index, Plex stream id
  language?: string; title?: string; codec?: string; channels?: number;
  channelLayout?: string; isDefault: boolean;
}
interface SubtitleStream {
  id: string; language?: string; title?: string; codec?: string;
  isDefault: boolean; isForced: boolean; isExternal: boolean;
  format: 'text' | 'image';        // image (PGS/VobSub) → burn-in
}
interface VideoStream {
  id: string; codec?: string; profile?: string; level?: number; width?: number; height?: number;
  bitDepth?: number; frameRate?: number; range: 'sdr' | 'hdr10' | 'hdr10+' | 'hlg' | 'dolby-vision';
}

interface Library { id: string; title: string; kind: 'movies' | 'shows' | 'music' | 'mixed' | 'other'; images: Images }
interface LibraryQuery {
  view: 'items' | 'artists' | 'albums' | 'tracks' | 'playlists';
  sort: { by: 'title' | 'dateAdded' | 'year' | 'rating' | 'random'; order: 'asc' | 'desc' };
  filter: { unplayed?: boolean; favorites?: boolean; genres?: string[]; letter?: string };
  offset: number; limit: number;
}
interface Page<T> { items: T[]; total: number }
```

Units: **milliseconds** everywhere in the domain (ExoPlayer and Plex already use
them); Jellyfin ticks are converted inside `backends/jellyfin` only.

Ids: the app routes with `ItemId` of the active server. Anything that outlives a
session (downloads, watch progress, metadata cache) is keyed by
`(serverId, itemId)`, because Plex `ratingKey`s like `"123"` collide across servers.

Images: items carry `ImageRef`s; `backend.imageUrl(ref, { width, height })`
builds the URL (Jellyfin `/Items/{id}/Images/{type}?tag=`; Plex
`/photo/:/transcode?url={thumb}&X-Plex-Token=`). This replaces
`getImageUrl(id, 'Primary')`, which assumed every item has an image at a URL
derived from its id.

### Ports

```ts
interface MediaBackend {
  readonly kind: ServerKind;
  readonly capabilities: Capabilities;      // per server, may be refined after connect
  imageUrl(ref: ImageRef, size?: ImageSize): string;
  authHeaders(): Record<string, string>;     // for ExoPlayer / downloads / native

  catalog: {
    libraries(): Promise<Library[]>;
    browse(libraryId: string, q: LibraryQuery): Promise<Page<MediaItem>>;
    genres(libraryId: string): Promise<string[]>;
    item(id: ItemId): Promise<MediaItem>;
    items(ids: ItemId[]): Promise<MediaItem[]>;
    libraryOf(id: ItemId): Promise<string | undefined>;
    home(): Promise<HomeSections>;           // continue watching, next up, latest per library
    seasons(seriesId): Promise<Season[]>; episodes(seasonId): Promise<Episode[]>;
    seriesEpisodes(seriesId): Promise<Episode[]>; nextUp(seriesId): Promise<Episode | null>;
    search(term: string, kinds?: ItemKind[]): Promise<MediaItem[]>;
    similar(id): Promise<MediaItem[]>; person(id): Promise<Person>; filmography(personId): Promise<MediaItem[]>;
    artistAlbums(id); artistTracks(id); albumTracks(id); playlists(q); playlistTracks(id); randomTracks(libraryId, n);
  };
  userData: {
    setPlayed(id: ItemId, played: boolean): Promise<void>;
    pushOfflineProgress(p: OfflineProgress): Promise<void>;
  };
  playback: {
    negotiate(req: PlaybackRequest): Promise<PlaybackPlan>;
    reporter(plan: PlaybackPlan): PlaybackReporter;   // start / progress / pause / stop / release transcode
    markers(id: ItemId): Promise<Marker[]>;
    trickplay(id: ItemId, versionId: string): Promise<Trickplay | null>;
    serverStreamInfo?(plan: PlaybackPlan): Promise<StreamInfo | null>;
  };
  music: {
    streamUrl(trackId: ItemId, req: AudioStreamRequest): string;
    lyrics(trackId: ItemId): Promise<Lyrics | null>;
  };
  downloads: { plan(req: DownloadRequest): Promise<DownloadPlan> };
}
```

### Playback expressed as intent (key design point)

Today the player tells Jellyfin *how* to build a profile. Tomorrow it says *what*
it wants, and each backend translates:

```ts
interface PlaybackRequest {
  itemId: ItemId; versionId?: string; startMs?: number;
  audioStreamId?: string;
  subtitle?: { streamId: string; mode: 'external' | 'burn-in' } | null;
  maxBitrate?: number; maxSize?: { width: number; height: number };
  device: DeviceCapabilities;              // from codecDetection (already neutral)
  constraints: {                            // the existing fallbacks, named
    allowDirectPlay: boolean;               // false = forceTranscode / quality cap
    allowVideoCopy: boolean;
    allowAudioCopy: boolean;                // false = Atmos/E-AC3 decode failure
    excludeVideoCodecs: string[];           // ['hevc'] after a decode failure
  };
  target: 'native' | 'web';
}
interface PlaybackPlan {
  method: 'direct-play' | 'direct-stream' | 'transcode';
  url: string; headers: Record<string, string>;
  version: MediaVersion;                    // streams as the server will deliver them
  startOffsetMs: number;                    // HLS transcodes start at the resume point
  externalSubtitles: { streamId: string; url: string; format: 'vtt' | 'srt' }[];
  session: { id: string };                  // opaque, used by the reporter
}
```

Jellyfin: `negotiate` builds the `DeviceProfile` + `PlaybackInfo` POST (code
moved from `usePlayerSession` and `constants.ts`, including the
`StartTimeTicks` / `AllowVideoStreamCopy` workaround). Plex: `PUT /library/parts`
for stream selection, `/video/:/transcode/universal/decision`, then
`start.m3u8` or the direct `Part.key`, with `X-Plex-Client-Profile-Extra`
generated from the same `DeviceCapabilities`.

The player composables keep their fallback *decisions* (when to retry, what to
retry with); they lose all URL and profile building.

### Auth & servers

- `ServerConnection { id, kind, name, user: { id, name }, baseUrl, candidateUrls[], tokenKey }`.
- `AuthFlow` is a small union both backends implement:
  `password` (Jellyfin), `deviceCode` (Jellyfin Quick Connect **and**
  plex.tv/link: show a code, poll until approved), `token` (Plex manual).
  The login page renders flows from the backend's list, so Quick Connect and
  plex.tv/link share one component.
- Plex adds an account step: the plex.tv token lists servers
  (`/api/v2/resources`), each with its own access token and connections; the
  backend probes `candidateUrls` (`/identity`, short timeout; local https
  `*.plex.direct` → remote → relay) and re-probes on network errors.
- Tokens stay in Capacitor `Preferences`, keyed `${kind}:${serverId}:${userId}`;
  the plex.tv account token is stored separately to refresh the server list.

### Capabilities

`deviceCodeLogin`, `markers`, `trickplay`, `lyrics`, `favorites`, `cast`,
`androidAuto`, `transcodedDownload`, `serverStreamInfo`, `similar`,
`personPages`. The UI hides what is off. Plex v1 expectation: markers ✓
(when the server analysed them), lyrics ✓, trickplay later (BIF), cast /
Android Auto later, transcoded downloads later.

## Migration strategy

Strangler pattern: Jellyfin-only Vela is refactored onto the domain first and
released; Plex arrives once the seams are proven. Every phase ends with
`npm test`, `npm run build` and the emulator smoke test green.

**Safety net first**: before touching playback, add characterization tests that
snapshot the exact `PlaybackInfo` request bodies and stream URLs produced today
for each scenario (default, resume, quality cap, forceTranscode, stripHevc,
transcodeAudio, PGS burn-in, web vs native). `JellyfinBackend.playback.negotiate`
must reproduce them byte for byte.

### Phase 0 — Groundwork (S)
- `npm ci`, baseline test run.
- Plex test server (Docker `plexinc/pms-docker`) loaded with the fictional
  library used by `~/.local/share/vela-dev/server.mjs`; record JSON fixtures for
  both backends into `src/backends/*/__fixtures__/`.
- Verify the Plex endpoints marked "confirm" below.

#### Phase 0 results (2026-11-22)

- Baseline: `npm ci`, 41 test files / 228 tests green, `vue-tsc` clean.
- plex.tv/link PIN flow works (`POST /api/v2/pins`, poll, `authToken`).
- Plex Home: `GET https://plex.tv/api/v2/home/users` → `{ users: [...] }` with
  `uuid`, `title`, `thumb`, `admin`, `protected`, `restricted`, `guest`.
  The admin profile itself can be PIN-protected.
- `/api/v2/resources`: one server had **18 connections** (15 local, mostly
  unreachable container/VPN addresses), the shared server 3.
- **Connection choice — plan corrected**: "prefer local" picked a local address
  at 902 ms over the remote one at 91 ms; probing 21 addresses sequentially took
  minutes. Rule now: probe all non-relay connections **in parallel** with a short
  timeout, take the first `200` from `/identity`; relay only if none answers;
  remember the winner per server and re-race on network error.
- Confirmed endpoints: sections, `all` with `type`/`sort`/`unwatched`/paging
  (`totalSize` present), `genre`, `firstCharacter`, `recentlyAdded` per section,
  metadata with `includeMarkers`/`includeChapters`, `children`, `allLeaves`,
  `similar`, `/hubs/home/continueWatching`, `/hubs/home/onDeck`,
  `/hubs/search` (one hub per type, actors included).
- `/hubs/home/recentlyAdded` returned nothing → use per-section `recentlyAdded`.
- Markers: `Marker[] { type: 'intro' | 'credits', startTimeOffset, endTimeOffset }`
  in ms; a movie can have several `credits` markers.
- Unwatched items simply omit `viewOffset` / `viewCount` / `lastViewedAt`:
  mappers must default them.
- Images: `Image[] { type: coverPoster | background | clearLogo | backgroundSquare, url }`
  besides `thumb` / `art` → maps directly to `Images.poster/backdrop/logo`.
- Streams carry `selected` (server-side per-user choice). **Design change**:
  do not use `PUT /library/parts` to switch tracks for direct play (it writes the
  user's default on the server); ExoPlayer selects tracks locally. For transcodes,
  pass the stream ids to the transcoder request instead (to verify on a
  throwaway server).
- Fixtures: `src/backends/plex/__fixtures__/` (real, anonymised, leak-checked)
  and `src/backends/jellyfin/__fixtures__/` (fake dev server, fictional).
- **Test account**: the user created a managed Plex Home profile dedicated to
  tests on their server. All further tests use **only** that profile (token
  obtained through the Home switch); the owner account is never used. The local
  Plex Media Server installed on the dev machine is not used for tests.
- Playback verified with that profile (no timeline, no scrobble, default streams):
  - direct play: `Range` request on `Part.key` → `206`, token in `X-Plex-Token` header;
  - `decision` with the built-in `Generic` profile → `4005 No conversion profile
    found for protocol hls`; with `X-Plex-Client-Profile-Extra`
    (`add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac,mp3)`
    + `add-direct-play-profile(...)`) → `1001 Conversion OK` (HEVC 4K → H.264
    720p, 3.8 Mb/s). **The Plex backend must always send a profile generated
    from `DeviceCapabilities`**, as planned.
  - decision codes: `1000` direct play OK, `1001` conversion OK, `2000` neither,
    `4005` no profile; `start.m3u8` answers `400` when the decision fails, so
    call `decision` first and surface its text as the error.
  - `start.m3u8` → master (1 variant) → media playlist (5 s segments, relative
    `session/...` paths) → segments `200` with the token header (first one
    2.1 s, then 0.7 s); `/video/:/transcode/universal/stop?session=` → `200`.
  - the profile's watch state was identical before and after: starting or
    stopping a transcode does not record progress.
- **Plan correction (native player)**: `NativeVideoPlugin` takes a single
  `authHeader` string that `NativePlayerActivity.kt` sends as `Authorization`
  (also used by `TrickplayThumbnails`). Plex needs `X-Plex-Token` (+ client
  headers) on the playlist and every segment. Phase 4 changes the plugin to a
  `headers: Record<string, string>` map (Kotlin
  `setDefaultRequestProperties(headers)`); `DownloadPlugin` already takes a map.
- Still not verified: `/:/timeline` and `/:/scrobble` (they write the test
  profile's watch state; allowed on that profile, to do in Phase 8), subtitle
  burn-in and stream selection for transcodes.

### Phase 1 — Domain + Jellyfin mappers (M, no UI change)
- `src/domain/*` types and `domain/logic` (move pure rules from `watchProgress`,
  `detailMeta`, `mediaTitle`, `audioTrackSelection`, `libraryOf`, `lyrics`).
- `backends/jellyfin/mappers.ts` (DTO → domain), fixture-tested.
- `architecture.test.ts` (dependency rule), initially scoped to `domain/` and `backends/`.

#### Phase 1 results (2026-11-22) — done

- `src/domain/`: `media.ts` (item union, images by role, user state, versions
  and streams), `query.ts`, `playback.ts` (request/plan/reporter, markers,
  chapters, trickplay), `music.ts`, `download.ts`, `server.ts` (kind,
  capabilities, `ServerConnection`), `auth.ts` (sign-in as a step machine:
  connected / choose-profile / choose-server, device-code sessions shared by
  Quick Connect and plex.tv/link), `backend.ts` (`MediaBackend` and its ports).
- `src/backends/jellyfin/mappers/` (SDK DTO → domain) and, ahead of plan,
  `src/backends/plex/mappers/` + `plex/types.ts`: writing both early is the
  real test of a backend-neutral model. Both are pure and fixture-tested
  (17 + 15 tests). No model change was needed for Plex.
- `src/architecture.test.ts`: domain imports nothing; backends import only
  the domain, themselves and their own SDK; no cross-backend imports; the app
  never imports a backend; `@jellyfin/sdk` outside the Jellyfin backend is
  frozen to a shrinking allowlist of 6 legacy files. Checked with deliberate
  violations (all 5 rules fail as expected).
- Totals: 44 files / 266 tests green, `vue-tsc` clean, build OK.
- Deferred to Phase 3: moving the pure rules (`watchProgress`, `detailMeta`,
  `mediaTitle`, `audioTrackSelection`, `libraryOf`, `lyrics`) into
  `domain/logic`. They still take Jellyfin DTOs and have live callers; they
  move with the pages that use them.
- Findings for later phases:
  - language codes differ (Jellyfin `fre`, Plex `fra`); the domain keeps raw
    codes and all matching must go through `languageMatches`
    (`usePlayerSession.parseAudioStreams` still uses `===`: fix in Phase 4);
  - Plex has no favourites (`capabilities.favorites = false`); its show/season
    watch state comes from leaf counts;
  - Plex stream ids (`Stream.id`) are global, not per-file indexes.

### Phase 2 — Session store (S)
- `session-store.ts` replaces the auth half of `jellyfin-store`:
  `ServerConnection`, `kind`, secure token keys, active backend instance.
- Persisted-state migration: old `SavedServer` → `kind: 'jellyfin'`; old token
  keys copied to new ones.
- Login page renders `AuthFlow`s (Jellyfin only for now).

#### Phase 2 results (2026-11-23) — done

- `store/session-store.ts`: saved `ServerConnection`s, active key, token in
  memory only (secure storage via `services/tokenStorage.ts`, keys
  `vela_token:<kind>:<serverId>:<userId>`), sign-in through the domain
  `Authenticator`s (only module allowed to import `backends/registry`).
- `backends/jellyfin/auth.ts`: password and Quick Connect as `AuthStep`s, errors
  as `AuthError` reasons; real `ServerId` from the server.
- One-time import of pre-session accounts (`store/sessionMigration.ts`, pure):
  old saved servers, per-user and active tokens, and the old device id are kept
  (Jellyfin tokens are tied to it). Old installs have no server id:
  `url:<address>` stands in, and a later sign-in to the same account replaces
  the entry. Runs in `main.ts` before the router mounts, because the old store
  shares the `jellyfin` localStorage key. Legacy Preferences keys are left in
  place until Phase 7.
- `jellyfin-store` lost all auth code; `serverUrl`, `accessToken`, `userId` are
  now read-only getters over the active Jellyfin connection, so data screens
  are unchanged. `App.vue` resets its caches when the active account changes.
- Each new Jellyfin sign-in gets its own device id (as Quick Connect already did).
- Login page, Settings, router guard and bottom nav use the session store.
- Checks: 47 files / 282 tests, `vue-tsc`, build; Chromium smoke test against
  the fake server: sign-in, reload, settings, sign-out, one-tap switch back,
  legacy install migrated (no page errors). `e2e/login.spec.ts` was already
  stale (expects the pre-rebrand title) and is not part of this change.

### Phase 3 — Catalog on the domain (L)
- `JellyfinBackend.catalog` + `imageUrl`; then switch screens one by one:
  home (`MediaList`, home cache) → `LibrariesPage` → `LibraryItemsPage` →
  `ItemDetailsPage` (split into movie/series/album sections while migrating if
  it helps) → `SearchPage` → `PersonDetailPage` → `LazyImg` placeholders by `kind`.
- `jellyfin-store` data methods deleted as their last caller goes.

#### Phase 3 execution notes (2026-11-23)

- 3a (done, committed): `JellyfinBackend` catalog / music browse / played
  state / image URLs; `session.backend`; `useBackend()` / `useImageUrl()`.
  The catalog port exposes home sections separately (`resumeItems`, `upNext`,
  `latest`) to keep progressive home loading.
- 3c: browse pages without downstream coupling: Libraries, Person, Search,
  Home (online part), Library grid. Offline lists still hold Jellyfin-shaped
  objects until Phase 6; they reach pages through a decode bridge
  (`registry.decodeStoredItem`, via the session store).
- 3d: Item details page, together with what it calls: codec checks
  (`codecDetection` on domain streams, pulled from Phase 4), the transcode
  download dialog, the download entry point (takes a small domain subject;
  the store still fetches and stores the Jellyfin DTO until Phase 6) and the
  audio-track conversion (pulled from Phase 5).

#### Phase 3 results (2026-11-23) — done

- All browse screens (home, libraries, grid, details, search, person) read
  domain types through `useBackend()`; image URLs come from domain image refs.
- New stores: `libraries-store` (per account, imports the old remembered
  libraries), `home-store` (snapshot keyed by account).
- Offline data (downloads, metadata cache) is still Jellyfin-shaped and reaches
  pages through `session.decodeStoredItem` until Phase 6.
- Domain additions found while migrating: `seasonTitle` on episodes, album
  artists with ids, technical video fields + file path for the media info
  dialog (Jellyfin-only flags such as IsAVC or pre-negotiation DirectPlay
  support were dropped from the dialog), `playedPercent` / `remainingMs`.
- Download entry point and transcode dialog take domain items / stream ids;
  `download-store` keeps its Jellyfin internals (Phase 6) behind a small
  domain→codec shim (`codecStreams`) until codec checks move in Phase 4.
- Cast button gated by `capabilities.cast`; downloads by `capabilities.downloads`.
- `jellyfin-store` is down to what the player, audio service and offline
  sync still use: `initializeApi`, `fetchItemDetails`, `fetchItemsByIds`,
  `fetchEpisodes`, `markPlayed`, `fetchRandomTracks`, `fetchLyrics`, `getImageUrl`.
- Known follow-up: `ItemDetailsPage.vue` is still ~1270 lines (limit 250);
  split it into kind-specific sections in a dedicated UI pass.
- Checks: 48 files / 288 tests, `vue-tsc`, build; Chromium smoke tests of every
  browse screen against the fake server (no page errors).

### Phase 4 — Playback on the domain (L, highest risk)
- Characterization tests (above), then `negotiate`, `reporter`, `markers`,
  `trickplay`, `serverStreamInfo` for Jellyfin.
- `usePlayerSession` / `useWebPlayer` / `useNativePlayer` / `useSkipIntro` /
  `useStreamInfo` consume `PlaybackPlan` and `MediaVersion` streams.
- `NativeVideoPlugin`: `authHeader: string` → `headers: Record<string, string>`
  (Kotlin `NativePlayerActivity` + `TrickplayThumbnails`); `trickplayJson`
  becomes a tagged union (`tiles` | `bif`) so Kotlin can grow BIF later.

#### Phase 4 results (2026-11-23)

- 4a (committed c0524f0): Jellyfin playback port: `negotiate` reproduces the
  10 golden PlaybackInfo scenarios byte for byte; reporter, markers, chapters,
  trickplay, live stream info. Pure device rules in `domain/device.ts`.
  Jellyfin list parameters are sent repeated, like the SDK.
- 4b: the player uses the port. `usePlayerSession.negotiate()` builds a
  `PlaybackRequest`; `applyPlan()` makes a plan current (URL, method, reporter).
  Web track switches use `preferStream`; the web burn-in URL, sidecar
  subtitle URLs and the master-playlist fallback moved into the backend
  (no more Jellyfin URL surgery in composables). Plan gains
  `mediaElementUrl` (players that cannot send headers).
- Codec checks, audio-track choice and subtitle choices work on domain streams
  (`codecDetection` is now the platform probe only). Language preferences
  match `fre`/`fra` via `languageMatches` everywhere in the player.
- Player track indexes are `Number(stream.id)` (numeric on Jellyfin and Plex);
  saved per-item choices keep their format.
- Chapters now come from `playback.chapters()` (the old details request never
  asked for them, so native chapters were always empty).
- Native plugin still takes a single `authHeader` (Jellyfin `Authorization`);
  the headers map lands with Plex (Phase 8, Kotlin).
- The download store keeps a private copy of the audio-codec filter for its
  Jellyfin transcode request until downloads move behind the backend (Phase 6).

### Phase 5 — Music on the domain (M)
- `audioPlayerService`: `music.streamUrl`, reporter, `lyrics` → domain `Lyrics`
  (`{ synced, lines: { startMs?, text }[] }`).
- `NativeAudioPlugin.setLibraryConfig` receives `kind` (Android Auto stays
  Jellyfin-only until Phase 9).

#### Phase 5 results (2026-11-23) — done

- `audioPlayerService` streams, shuffles, reports and builds artwork through
  `backend.music` (new `music.reporter(trackId)`); stream URLs identical to
  before. The reported volume is now 0–100 (it was sent as 0–1).
- Queue tracks carry their cover as a domain image ref (`AudioTrack.artwork`);
  queues saved before the update get it from the server once.
- Lyrics are domain `Lyrics` (ms) and gated by `capabilities.lyrics`.
- Android Auto receives credentials only for Jellyfin accounts (its native
  library is Jellyfin-only until Phase 9).
- Router audio redirect, OfflineHome shuffle and the mini / expanded players
  no longer touch Jellyfin types.

### Phase 6 — Offline on the domain (M)
- `DownloadedMedia`: `serverId` + `item: MediaItem` snapshot instead of
  `jellyfinItem`; IndexedDB version bump with an upgrade that converts existing
  records with the Jellyfin mapper (existing downloads must survive).
- `metadata-cache-store` stores domain items (same conversion).
- `downloads.plan` replaces the PlaybackInfo / `/Download` / subtitle / segment
  URL building in `download-store` and `downloadService`.
- `syncService` → `userData.pushOfflineProgress`.

#### Phase 6 results (2026-11-23) — done

- 6a (bb329d8): `backend.downloads.plan` (original file or forced-params
  transcode, sidecar subtitle, markers) and `userData.pushOfflineProgress`.
- 6b: download records hold `serverId`, a domain `item` and `markers`.
  Records saved before the update (`jellyfinItem`, `introSegments`) are
  converted on load through the active backend's decoder and written back once
  (`utils/offlineRecords.ts`); the legacy fields are kept, so no IndexedDB
  version bump was needed.
- `download-store` builds a `DownloadRequest` (quality preset, display-sized
  transcode when the device cannot play the file, desktop sidecar subtitle) and
  hands the plan to `downloadService.downloadForOffline`. Artwork caching takes
  domain image refs; cache paths are unchanged, so cached images survive.
- `metadata-cache-store` stores domain items; old entries are decoded lazily.
- `offline-store`, `syncService`, `offlineLibrary`, `watchProgress` and the
  offline screens (OfflineHome, library grid, details, player) read domain
  items only.
- Verified: 299 tests, type check, build. Not yet checked on a device with
  downloads made by the previous version: do it before the Phase 7 release.

### Phase 7 — Seal (S)
- Delete `types/jellyfin.ts`, `jellyfin-store.ts`, `utils/jellyfinAuthorization.ts`,
  `playbackUrl.ts` (moved), `constants.ts` device profiles (moved).
- `architecture.test.ts` covers all of `src/`: no `@jellyfin/sdk` and no
  `backends/*` import outside `backends/`.
- i18n: Jellyfin-specific strings (`forceOfflineHint`, `quickConnectCode`,
  `qcDisabled`) become backend-neutral or backend-scoped.
- **Release Jellyfin-only Vela on the new architecture** and watch for regressions.

#### Phase 7 results (2026-11-23) — done, release pending

- Deleted `store/jellyfin-store.ts`, `types/jellyfin.ts`,
  `utils/jellyfinAuthorization.ts` and the Jellyfin item-type fallback of
  `LazyImg` / `utils/placeholders.ts`. Downloads page artwork comes from domain
  image refs; Cast reads the server URL and token from the session.
- `architecture.test.ts`: no server SDK outside its own backend (the legacy
  allowlist is gone); the app may not reach `backends/` through relative paths
  either.
- i18n: `forceOfflineHint` is backend-neutral. The Quick Connect strings stay:
  only the Jellyfin sign-in shows them.
- Kept on purpose: the pre-session keys (`jellyfin` in localStorage, the
  `jellyfin_*` Preferences tokens). The session and library imports read them
  once, behind their own flags, and keeping them lets a downgraded build sign
  in again. Delete them in a later release.
- Verified: 299 tests, type check, build, debug APK. Download records in the
  old format, seeded into IndexedDB, show on the downloads page and are
  converted once (domain item, server id, intro segment → marker).
- Left for later: split `ItemDetailsPage.vue` (~1270 lines); the native
  `audioSwitchJellyfin` event name (renamed with the Phase 8 plugin changes).
- Release of Jellyfin-only Vela on the new architecture: the user's call.

### Phase 8 — Plex backend, video v1 (L)
- `plex/client.ts`, `auth.ts` (pins, Home users + switch, resources, connection
  probing), `mappers.ts` (fixture-tested), catalog (movie and show libraries),
  playback (direct play, transcode, audio/subtitle switching, PGS burn-in,
  quality presets), reporter (timeline + transcode stop), markers, chapters.
- Login: server-type choice → plex.tv/link code → Home profile picker (+ PIN)
  → server picker → connection probing. Settings: switch Plex profile.
- Out of v1: music, downloads, trickplay, Cast, Android Auto (capabilities off).
- No changes expected outside `backends/plex`, the login page and capability
  gating; if a page needs a change, the domain model was wrong: fix the model.

#### Phase 8 results (2026-11-23) — done, user test pending

Commits: 8a 2231ecc (auth), 8b 0a2f0ef (catalog), 8c 0b6b119 (playback),
8d/8e 04546f2 (login UI, profile switch, headers map).

- Auth: plex.tv/link PIN → `GET /api/v2/user` + `/api/v2/home/users` →
  `POST /api/v2/home/users/{uuid}/switch` (PIN) → `/api/v2/resources` with the
  profile's token → parallel `/identity` race (relays 1.5 s later). PMS
  requests carry the resource `accessToken`; the plex.tv account token is kept
  under `ServerConnection.accountKey` for "Switch Plex profile". The session
  re-races the saved addresses once per account per app run (3 s budget).
- Catalog (verified live, read-only): paging needs both
  `X-Plex-Container-Start` and `-Size`; letters via
  `/library/sections/{id}/firstCharacter/{L}` (honours type, sort, genre,
  paging); genres filter by tag id; shows "latest" sorts on `episode.addedAt`;
  people via `/library/people/{id}` + per-section `actor=`. No favourites.
- Playback: Vela decides direct play itself (container + device decoders +
  chosen audio). PMS's generic profile refuses direct play when the chosen
  audio is not the first track ("app cannot select audio streams"), and
  `add-setting` in the profile extra does not change that. Otherwise the
  decision runs with `X-Plex-Client-Profile-Extra` and `start.m3u8` repeats
  its parameters. Verified live as the managed profile: direct play (Range),
  forced transcode, 2 Mb/s cap, audio switch (direct-stream, alternate track
  delivered), PGS burn-in. Embedded subtitles cannot be fetched
  (`/library/streams/{id}` → 501): only files beside the video are sidecars;
  the rest is burned in (or read by ExoPlayer in direct play).
- Players take a headers map (hls.js, subtitle fetch, ExoPlayer, trickplay).
  SRT sidecars become WebVTT on the web; ExoPlayer gets each sidecar's MIME.
- Verified end to end: web build (Playwright, plex.tv simulated except
  `resources`): sign-in, wrong PIN, profiles, home, libraries, grid, details,
  HLS playback, switch profile. Emulator: same sign-in through CDP Fetch,
  native ExoPlayer HLS playback on the user's server. Jellyfin regressions:
  web login/migration/playback, native playback.
- Known: one `/photo/:/transcode` image is blocked by the browser (ORB);
  the timeline is only exercised by unit tests and by the emulator run, so the
  watched state of a real profile still needs the user's own test.

### Phase 9 — After v1: Plex music, downloads, native & extras (M)
- Plex music (artists, albums, playlists, lyrics) and original-file downloads.
- Kotlin: `MediaCatalog` interface, `JellyfinCatalog` (from `JellyfinLibrary.kt`),
  `PlexCatalog`; `ArtworkProvider` per kind.
- BIF parsing in `TrickplayThumbnails.kt`.
- Cast for Plex via the Default Media Receiver (URL + token), or keep it hidden.
- Plex transcoded downloads.

#### Phase 9 results (2026-11-23) — done, phone test pending

Plan: `docs/superpowers/plans/2026-11-23-plex-phase-9.md`. Commits ac2efc2 →
6bfefdc.

- Music: Plex MusicPort; tracks stream their part file directly (Range) via
  `MediaVersion.streamRef` / `AudioTrack.streamRef`, else the universal music
  stream (needs a musicProfile client profile; no Range, so only for
  conversions or a quality cap below 10 Mb/s). Lyrics from the track's
  `streamType 4` stream (LRC → synced).
- Downloads: original part `?download=1`; converted downloads as Matroska
  (`start.mkv`, context streaming): PMS refuses the `static` context and
  streams an empty progressive MP4.
- BIF previews: `/library/parts/{id}/indexes/sd` when the part has
  `indexes`; native `SeekPreviews` (BIF or Jellyfin tiles), `BifIndex` JUnit-
  tested. The user's server has no generated previews: not verified live.
- Cast: `MediaBackend.castMode`; Plex casts a browser-profile stream URL (token
  inside) on the Default Media Receiver. Stream checked without headers; no
  Cast device available for an end-to-end test.
- Android Auto: `MusicLibrary` (Jellyfin / Plex) chosen from the pushed config;
  `PlexMusicApi` JUnit-tested and checked against the real server. Not tested
  in a car.
- Plex images without a size are served as the original (the photo
  transcoder answers 400 without one).
- Watch state checked live on the managed profile (allowed since 2026-11-24):
  resume at 120 s + Continue Watching, played/unplayed, a movie stopped at 95 %
  becomes watched. PMS keeps no play count from a music timeline (with or
  without `type=music`): the Plex music reporter scrobbles a track stopped
  after 90 % of it. Audio playlists: listed, server order kept, direct files.

### Phase 10 — Verification & docs
- Emulator smoke test on both backends (login → browse → play → resume → change
  audio/subtitles → mark watched → music + lyrics → download → offline playback).
- README, PRODUCT.md, `package.json` description, CLAUDE.md / AGENTS.md
  ("Jellyfin SDK via service wrappers" → backends layout).

## Plex API reference (to confirm in Phase 0)

| Need | Plex |
|---|---|
| Headers | `X-Plex-Token`, `X-Plex-Client-Identifier`, `X-Plex-Product=Vela`, `X-Plex-Version`, `X-Plex-Platform`, `X-Plex-Device`, `Accept: application/json` |
| Device-code login | `POST https://plex.tv/api/v2/pins` (non-strong → 4-char code for plex.tv/link), poll `GET /api/v2/pins/{id}` |
| Servers | `GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1` |
| Libraries | `/library/sections` (`movie`, `show`, `artist`) |
| Browse | `/library/sections/{id}/all?type=1|2|8|9|10`, `X-Plex-Container-Start/Size`, `sort=`, `genre=`, `unwatched=1`; A–Z via `firstCharacter` (confirm) |
| Item | `/library/metadata/{ratingKey}?includeMarkers=1&includeChapters=1`; `/children`, `/allLeaves`, `/similar` |
| Home | `/hubs/home/continueWatching`, `/hubs/home/onDeck`, `/library/sections/{id}/recentlyAdded` (confirm) |
| Search | `/hubs/search?query=` |
| People | `Role` tag id → `?actor={id}` per section (confirm a cross-library approach) |
| Played | `/:/scrobble`, `/:/unscrobble` (`identifier=com.plexapp.plugins.library`) |
| Reporting | `/:/timeline?ratingKey&key&state&time&duration`; transcode stop `/video/:/transcode/universal/stop?session=` |
| Streams | `PUT /library/parts/{partId}?audioStreamID=&subtitleStreamID=` |
| Playback | direct `Part.key`; `/video/:/transcode/universal/decision` → `start.m3u8` (`subtitles=burn|sidecar`, `maxVideoBitrate`, `videoResolution`, `X-Plex-Client-Profile-Extra`) |
| Subtitles | `/library/streams/{id}` (external), sidecar via transcoder for embedded text |
| Markers | `Marker` `type=intro|credits` (ms) |
| Lyrics | track `Stream` `streamType=4` → `/library/streams/{id}` (LRC) |
| Music | `/playlists?playlistType=audio`, `/playlists/{id}/items`, `sort=random`, `/music/:/transcode/universal/start.mp3` |
| Trickplay | `/library/parts/{id}/indexes/sd` (BIF) |
| Images | `/photo/:/transcode?url=&width=&height=&X-Plex-Token=` |

## Risks

- **Playback regressions** in Phase 4: years of device-specific fixes live in
  `usePlayerSession`. Mitigation: characterization tests + emulator smoke test
  per fallback path.
- **Offline data migration** (Phase 6): a broken IndexedDB upgrade loses
  users' downloads. Mitigation: upgrade is additive (keep `jellyfinItem` until
  one release later), tested on a DB fixture.
- **Scope**: this is roughly twice the work of the adapter approach, front-loaded
  in Phases 1–7 that ship no new feature. In exchange, Plex (and any future
  backend such as Emby) becomes a self-contained folder.
- Plex endpoints are partly undocumented; Phase 0 fixtures are the contract.

## Decisions (2026-11-22)

1. Plex login: **plex.tv/link code only** (no manual token, no email/password).
2. Plex v1 scope: **video only**. Music libraries are not listed for Plex
   (`capabilities.music = false`). Downloads for Plex are not in v1 either
   (`capabilities.downloads = false`) unless the user asks otherwise.
3. A real Plex server with Plex Pass is available → markers (intro/credits)
   are in v1 scope and testable. Fixtures recorded from it must be anonymised
   (titles, paths, tokens, machine ids) before being committed.
4. Android Auto, Cast, trickplay for Plex: **later** (Phase 9, out of v1).
5. **Plex Home is supported** in v1 (see below).
6. The Jellyfin-only refactor **ships before Plex** (end of Phase 7).

### Plex Home (v1)

- After the plex.tv/link code is approved, list Home users:
  `GET https://plex.tv/api/v2/home/users` (confirm in Phase 0).
- Profile picker (avatar, name, lock icon when PIN-protected); PIN entry for
  protected profiles; `POST /api/v2/home/users/{uuid}/switch` (with `pin`)
  returns that user's plex.tv token.
- Server list (`/api/v2/resources`) is fetched **with the selected user's
  token**, so each profile only sees the servers and libraries it is allowed to.
- Each (server, Home user) pair is a `ServerConnection`; the existing saved-
  accounts list on the login page shows them like Jellyfin users.
- The admin plex.tv token is kept so the user can switch profile later from
  Settings without redoing plex.tv/link ("Switch Plex profile").
- Managed users have no plex.tv credentials of their own: never assume an
  email on the account object.
