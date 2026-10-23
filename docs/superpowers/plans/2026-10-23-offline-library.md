# Offline library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse downloads inside the normal library pages behind a "Téléchargés" filter (forced on offline), turn the Téléchargés tab into a management page, show an offline home, and keep watch progress synced with Jellyfin (most recent playback wins).

**Architecture:** A pure module (`src/utils/offlineLibrary.ts`) builds library pages (albums, artists, songs, movies, series) from `offlineStore.downloads`, with the same `{ items, total }` shape as the server fetchers, so `LibraryItemsPage` only swaps its data source. Each download record gains its library id (backfilled from Jellyfin ancestors while online). The library list is persisted. Progress uses a pure resolver (`src/utils/watchProgress.ts`) for both display and sync.

**Tech Stack:** Vue 3 `<script setup>`, Pinia (+ persistedstate), Capacitor v8 (Kotlin plugin), @jellyfin/sdk 1.0, Vitest (jsdom), Tailwind v4, Reka UI, lucide-vue-next.

**Spec:** `docs/superpowers/specs/2026-10-23-offline-library-design.md` (mockups: https://claude.ai/artifact/8pz6nP1bv3U4gv9HSsAZiK)

## Global Constraints

- Work on branch `feat/offline-library` from `main`; one commit per task; commit trailer lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_012UWGbbuk4MFU1YnxMnWmtW`.
- "Offline" means `!offlineStore.isFullyOnline` everywhere (it already folds in
  `preferencesStore.forceOfflineMode`); no new offline flag.
- Copy is French + English in `src/locales/{fr,en}.json`, formal "vous" like the rest of the app
  (the mockups' "tu" is replaced): e.g. "Hors ligne · seuls vos téléchargements sont affichés".
- Conflict rule: **the most recent playback wins** — local `WatchProgress.lastWatched` (ms) vs
  Jellyfin `UserData.LastPlayedDate` (ISO).
- "Reprendre": started (position > 0) and `percentage < 90`, most recent first.
- Music never mixes libraries: everything (home rows, shuffle) is per library id.
- Filter on: Playlists tab hidden. Online, detail pages stay server pages (unchanged).
- Touch targets ≥ 44 px; icons from lucide; components from `src/components/ui` / layout.
- Gates per task: `npx vitest run` and `npx vue-tsc --noEmit` both clean.

## Review Focus

1. A download with no library id (backfill not run yet, app offline since install) must still be listed: it falls back to the only library of its collection type, else the first one of that type (Task 1 test `falls back to the library of the same type`).
2. Tracks without `AlbumId` or `AlbumArtists` (singles, loose files) appear in Titres and never crash Albums/Artistes (Task 1 test `skips album and artist grouping for loose tracks`).
3. Server `UserData` without `LastPlayedDate`, or equal timestamps → the local progress is pushed (Task 2 test `pushes local when the server has no date`).
4. Random sort must not reshuffle between infinite-scroll pages (Task 1 test `random order is stable across pages`).
5. Going offline while a library page is open with the filter off switches it to local data without an error state (Task 7 step "watch offline" + device check in Task 11).

---

### Task 1: Local library queries

**Files:**
- Create: `src/utils/offlineLibrary.ts`
- Test: `src/utils/offlineLibrary.test.ts`

**Interfaces:**
- Consumes: `DownloadedMedia` (`src/services/offlineDatabase.ts`) — this task adds `libraryId?: string` to it (no DB migration; not indexed).
- Produces:
  - `type LocalView = 'albums' | 'artists' | 'songs' | 'items'` (`items` = video library grid: movies, or series for `tvshows`).
  - `interface LocalQuery { startIndex: number; limit: number; sortBy: string; sortOrder: 'Ascending' | 'Descending'; unplayedOnly: boolean; favoritesOnly: boolean; genres: string[]; nameStartsWith: string; seed: number }`
  - `interface LocalLibrary { Id: string; CollectionType?: string | null }`
  - `downloadsInLibrary(downloads: DownloadedMedia[], library: LocalLibrary, libraries: LocalLibrary[]): DownloadedMedia[]`
  - `localLibraryPage(downloads: DownloadedMedia[], view: LocalView, collectionType: string | null | undefined, query: LocalQuery, seriesMeta?: (id: string) => any | undefined): { items: any[]; total: number }`
  - `localGenres(items: any[]): string[]` (sorted, unique)
  - `librariesWithDownloads<T extends LocalLibrary>(libraries: T[], downloads: DownloadedMedia[]): T[]`
  - `downloadedTracks(downloads: DownloadedMedia[]): any[]` (the `jellyfinItem` of every `Audio` download)

- [ ] **Step 1: Create the branch** — `git checkout -b feat/offline-library main`.

- [ ] **Step 2: Write the failing tests** in `offlineLibrary.test.ts`, with a `dl(type, item, extra)` fixture builder returning a `DownloadedMedia`:
  - `groups tracks into albums`: 3 tracks, 2 with `AlbumId: 'al1', Album: 'Plague', AlbumArtists: [{Id:'ar1',Name:'SLUMB'}]`, 1 with `AlbumId: 'al2'` → view `albums` returns 2 items, first `{ Id: 'al1', Name: 'Plague', Type: 'MusicAlbum', AlbumArtists: [...], ChildCount: 2 }`; `total === 2`.
  - `groups tracks into artists`: same fixture → `artists` returns `{ Id: 'ar1', Name: 'SLUMB', Type: 'MusicArtist' }` once.
  - `skips album and artist grouping for loose tracks`: a track with no `AlbumId`/`AlbumArtists` → in `songs`, not in `albums` or `artists`, no throw.
  - `lists series from episodes`: 2 episodes of `SeriesId: 's1', SeriesName: 'MobLand'` with `collectionType 'tvshows'`, view `items` → one `{ Id: 's1', Name: 'MobLand', Type: 'Series' }`; with `seriesMeta` returning `{ Id: 's1', Name: 'MobLand', ProductionYear: 2025 }` that object is used instead.
  - `lists movies for a movies library`: view `items`, `collectionType 'movies'` → the movie `jellyfinItem`s.
  - `filters favorites, unplayed and genres` (UserData.IsFavorite, UserData.Played, Genres).
  - `filters by first letter`: `nameStartsWith 'P'` keeps "Plague"; `'#'` keeps "1825" (non-letter first char of `SortName ?? Name`).
  - `sorts by name and date, both orders` (`SortName`, `PremiereDate`, `DateCreated`, `CommunityRating`, `PlayCount` = `UserData.PlayCount`).
  - `random order is stable across pages`: same `seed`, pages `startIndex 0 limit 2` + `startIndex 2 limit 2` concatenated equal page `0..4`; a different seed gives another order.
  - `pages with startIndex and limit` (`total` = full filtered count).
  - `keeps a library's own downloads`: `downloadsInLibrary` keeps records whose `libraryId` matches.
  - `falls back to the library of the same type`: record without `libraryId`, type `Audio`, libraries `[{Id:'m',CollectionType:'music'},{Id:'f',CollectionType:'movies'}]` → in `m`, not `f`; with two music libraries → only in the first.
  - `librariesWithDownloads hides empty libraries`.
- [ ] **Step 3: Run** `npx vitest run src/utils/offlineLibrary.test.ts` → FAIL (module not found).
- [ ] **Step 4: Implement** the functions above. Collection type of a record: `Audio`/`MusicAlbum` → `music`, `Movie` → `movies`, `Episode` → `tvshows`. Random order: a seeded shuffle (mulberry32 on `seed`) applied before paging. Album/artist/series items carry what the grid template reads (`Id`, `Name`, `Type`, `AlbumArtist(s)`, `ProductionYear`, `UserData` from the first track/episode).
- [ ] **Step 5: Run** the test file → PASS; `npx vue-tsc --noEmit` → clean.
- [ ] **Step 6: Commit** `feat(offline): build library pages from downloaded media`.

### Task 2: Progress resolution

**Files:**
- Create: `src/utils/watchProgress.ts`
- Test: `src/utils/watchProgress.test.ts`

**Interfaces:**
- Consumes: `WatchProgress`, `DownloadedMedia` (`offlineDatabase.ts`).
- Produces:
  - `interface EffectiveProgress { position: number; percentage: number; played: boolean; lastPlayed: number }` (seconds, 0–100, ms)
  - `effectiveProgress(item: any, local?: WatchProgress): EffectiveProgress` — from `item.UserData` (`PlaybackPositionTicks / 1e7`, `PlayedPercentage`, `Played`, `Date.parse(LastPlayedDate)`, 0 if absent) unless `local.lastWatched` is newer or equal.
  - `shouldPushLocal(local: WatchProgress, server: { LastPlayedDate?: string | null } | undefined): boolean` — true unless the server date is strictly newer.
  - `resumeCandidates(downloads: DownloadedMedia[], local: Map<string, WatchProgress>): { media: DownloadedMedia; progress: EffectiveProgress }[]` — `Movie`/`Episode` only, `position > 0 && percentage < 90 && !played`, sorted by `lastPlayed` desc.

- [ ] **Step 1: Write the failing tests**: `uses the server data when it is newer`, `uses local progress when it is newer`, `local wins on equal dates`, `pushes local when the server has no date`, `keeps the server when its date is newer`, `resume lists started videos under 90 %, newest first` (excludes a 95 % one, an unstarted one and an `Audio`).
- [ ] **Step 2: Run** `npx vitest run src/utils/watchProgress.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(offline): resolve offline vs server watch progress`.

### Task 3: Library ids, remembered libraries, sizes and album covers

**Files:**
- Modify: `src/store/jellyfin-store.ts` (persist `libraries`; add `fetchLibraryIdOf`, `fetchItemsByIds`)
- Modify: `src/store/offline-store.ts` (add `backfillLibraryIds`, `backfillSizes`; call them)
- Modify: `src/store/download-store.ts` (after `offlineStore.loadDownloads()` on completion, call `offlineStore.backfillLibraryIds()`)
- Modify: `src/services/downloadService.ts` (`buildOfflineArtworkTargets`: `Audio` also caches `AlbumId` Primary 600)
- Modify: `android/app/src/main/java/cloud/valgrind/vela/DownloadPlugin.kt`, `src/plugins/DownloadPlugin.ts` (`size`)
- Create: `src/utils/libraryOf.ts` + `src/utils/libraryOf.test.ts`
- Test: `src/services/downloadService.test.ts`

**Interfaces:**
- Produces:
  - `pickLibraryId(ancestors: { Id?: string | null; Type?: string | null }[], libraryIds: string[]): string | undefined` — first ancestor whose `Id` is a known library, else the first `Type === 'CollectionFolder'`.
  - `jellyfinStore.fetchLibraryIdOf(itemId: string): Promise<string | undefined>` — `getLibraryApi(api).getAncestors({ itemId, userId })` + `pickLibraryId(…, this.libraries ids)`.
  - `jellyfinStore.fetchItemsByIds(ids: string[]): Promise<BaseItemDto[]>` — `getItems` with `ids` (chunks of 100), `fields` incl. `UserData`, `recursive: true`.
  - `offlineStore.backfillLibraryIds(): Promise<void>` — online only; for each download without `libraryId`, set it via `fetchLibraryIdOf` and `offlineDatabase.addDownload`; then `loadDownloads()`.
  - `offlineStore.backfillSizes(): Promise<void>` — native only; for `fileSize === 0` and `content://` path, `DownloadPlugin.size({ uri })`, save.
  - `DownloadPlugin.size(opts: { uri: string }): Promise<{ size: number }>` — Kotlin: `contentResolver.query(uri, arrayOf(OpenableColumns.SIZE))`, reject when no row.
  - `jellyfin-store` `persist.pick` gains `'libraries'` (logout already resets it to `[]`).

- [ ] **Step 1: Write the failing tests**: `libraryOf.test.ts` — `prefers a known library ancestor`, `falls back to the collection folder`, `returns undefined without one`; `downloadService.test.ts` — `caches the album cover of a track` (`{ Id:'t', Type:'Audio', AlbumId:'al' }` → targets include `{ itemId:'al', imageType:'Primary', maxWidth:600 }`).
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement** `pickLibraryId`, the artwork target, the store/plugin functions above. Call `backfillSizes()` then `backfillLibraryIds()` from `offlineStore.init()` after `loadDownloads()` (the latter only when online), and `backfillLibraryIds()` again in `setupAutoSync` on the offline→online transition.
- [ ] **Step 4: Run** `npx vitest run` and `npx vue-tsc --noEmit` → clean.
- [ ] **Step 5: Commit** `feat(offline): remember libraries and the library of each download`.

### Task 4: Sync progress with the conflict rule, refresh from Jellyfin

**Files:**
- Modify: `src/services/syncService.ts`
- Modify: `src/store/offline-store.ts` (add `refreshDownloadedUserData`; call after sync)
- Test: `src/services/syncService.test.ts`

**Interfaces:**
- Consumes: `shouldPushLocal` (Task 2), `jellyfinStore.fetchItemsByIds` (Task 3).
- Produces:
  - `syncService.syncWatchProgress(serverUrl, accessToken, userId: string): Promise<{ synced: number; failed: number; kept: number }>` — per unsynced entry: `GET {server}/UserItems/{id}/UserData?userId=` ; if `shouldPushLocal` → `POST {server}/UserItems/{id}/UserData?userId=` body `{ PlaybackPositionTicks: completed ? 0 : round(position*1e7), Played: completed, LastPlayedDate: new Date(lastWatched).toISOString() }`; either way (pushed or server kept) `markProgressSynced`. Auth header via `jellyfinAuthorization(accessToken)` as today. Replaces the `/Sessions/Playing/Stopped` call.
  - `offlineStore.refreshDownloadedUserData(): Promise<void>` — online only; `fetchItemsByIds(download ids)`, write each item's `UserData` into its record's `jellyfinItem`, save, `loadDownloads()`.

- [ ] **Step 1: Write the failing tests** (`vi.stubGlobal('fetch', …)`, `vi.mock('./offlineDatabase')`, `offlineDetection.isFullyOnline` mocked true): `pushes newer local progress` (POST body exact as above), `keeps newer server progress` (no POST, marked synced, `kept === 1`), `marks played when completed` (`Played: true, PlaybackPositionTicks: 0`), `counts a failed request` (500 → not marked).
- [ ] **Step 2: Run** `npx vitest run src/services/syncService.test.ts` → FAIL.
- [ ] **Step 3: Implement**; update `offlineStore.syncWatchProgress` to pass `jellyfinStore.userId` and then `await this.refreshDownloadedUserData()`; also call `refreshDownloadedUserData()` in `init()` when online.
- [ ] **Step 4: Run** all tests + type check → clean.
- [ ] **Step 5: Commit** `fix(offline): push offline progress with the most-recent-wins rule`.

### Task 5: Stop redirecting offline; shared banner and cached artwork

**Files:**
- Modify: `src/router/index.ts:114-124` (drop the offline redirect of `libraries`, `libraryList`, `libraryItem`)
- Modify: `src/App.vue:81-89` (drop the redirect watcher; keep the forceOffline → sync watcher)
- Create: `src/components/offline/OfflineBanner.vue`
- Create: `src/composables/useOfflineArtwork.ts` + `src/composables/useOfflineArtwork.test.ts`
- Modify: `src/locales/fr.json`, `en.json` (`offline.banner`: "Hors ligne · seuls vos téléchargements sont affichés" / "Offline · only your downloads are shown")

**Interfaces:**
- Produces:
  - `<OfflineBanner />` — the status row of mockups 2 and 5B (`role="status"`, WifiOff icon, text `offline.banner`), renders only when offline.
  - `useOfflineArtwork(): { artworkUrl(id: string | undefined, fallback: string): string; preload(ids: string[]): Promise<void> }` — preloads `downloadService.getCachedImageUrl(id)` into a reactive map; `artworkUrl` returns the cached URL, else `fallback` when online, else `''`.

- [ ] **Step 1: Write the failing test** `useOfflineArtwork.test.ts` (mock `downloadService.getCachedImageUrl`, offline store online/offline): `returns the cached url after preload`, `returns the fallback online`, `returns empty offline without cache`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** composable, banner, router/App changes.
- [ ] **Step 4: Run** tests + type check → clean.
- [ ] **Step 5: Commit** `feat(offline): keep library routes reachable offline`.

### Task 6: Library list offline

**Files:**
- Modify: `src/pages/LibrariesPage.vue`
- Modify: `src/locales/fr.json`, `en.json` (`offline.noDownloads`: "Aucun téléchargement" / "No downloads")

**Interfaces:**
- Consumes: `librariesWithDownloads` (Task 1), persisted `store.libraries` (Task 3), `OfflineBanner`, `useOfflineArtwork` (Task 5).

- [ ] **Step 1: Implement**: offline → no fetch, `libraries = librariesWithDownloads(store.libraries, offlineStore.downloads)`, `<OfflineBanner />` above the grid, tile images through `artworkUrl(lib.Id, serverUrl)`; online → also `downloadService.cacheArtworkById(server, token, lib.Id, 'Primary', 800)` for each library after a successful fetch (so their tiles exist offline). Empty offline list → existing empty-state style with "Aucun téléchargement" (`offline.noDownloads`).
- [ ] **Step 2: Run** type check + tests → clean.
- [ ] **Step 3: Commit** `feat(offline): library list shows the libraries holding downloads`.

### Task 7: "Téléchargés" filter on library pages

**Files:**
- Modify: `src/pages/LibraryItemsPage.vue`
- Modify: `src/locales/fr.json`, `en.json` (`library.downloaded`: "Téléchargés"/"Downloaded"; `library.offlineLocked`: "Hors ligne : le filtre reste activé." / "Offline: the filter stays on."; the header count keeps the existing `library.count.*` keys, fed with the local total)

**Interfaces:**
- Consumes: `localLibraryPage`, `downloadsInLibrary`, `localGenres`, `downloadedTracks` (Task 1); `useOfflineArtwork` (Task 5).
- Produces: `LibraryState.downloadedOnly: boolean` (sessionStorage, like the other filters).

- [ ] **Step 1: Implement**:
  - `downloadedOnly` ref; `isOffline = computed(() => !offlineStore.isFullyOnline)`; `localMode = computed(() => downloadedOnly.value || isOffline.value)`.
  - Filter row: a first `Toggle` "Téléchargés" (Download icon; WifiOff icon, pressed and `disabled` when offline) before the existing quick toggle; under the row, when offline, a caption line `library.offlineLocked`.
  - `fetchPage`: in `localMode`, resolve `localLibraryPage(downloadsInLibrary(offlineStore.downloads, currentLibrary, store.libraries), view, collectionType, { …queryOptions, seed })` where `seed` is drawn once per `loadPage()`; music tab → view (`albums`/`artists`/`songs`), video → `items`.
  - Playlists tab hidden in `localMode`; if it was selected, switch to `albums`.
  - Genres: `localGenres(items of the current view)` in `localMode`; no `fetchGenres`/`fetchLibraries` call offline.
  - Shuffle button in `localMode`: `audioStore.playAlbum(shuffled downloadedTracks(library downloads).map(toAudioTrack), 0)` (no `libraryShuffle` refill).
  - Grid/list images through `artworkUrl(id, serverUrl)`; `preload` ids of each loaded page (album ids, series ids, item ids).
  - Watch `isOffline`: on change → `loadPage()` (Review Focus 5).
- [ ] **Step 2: Run** type check + tests → clean.
- [ ] **Step 3: Commit** `feat(library): Téléchargés filter, forced on offline`.

### Task 8: Album and artist pages offline; offline resume

**Files:**
- Modify: `src/pages/ItemDetailsPage.vue` (offline branches in `load()`, ~line 625)

**Interfaces:**
- Consumes: `effectiveProgress` (Task 2); `offlineStore.downloads`; `metadataCache.get(id, true)`.

- [ ] **Step 1: Implement** two offline branches next to the series/season ones:
  - album: tracks = `Audio` downloads with `albumId === itemId` sorted by `ParentIndexNumber`, `IndexNumber`; `item = metadataCache.get(id, true) ?? { Id, Name: albumName, Type: 'MusicAlbum', AlbumArtists, ProductionYear }` from the first track; `audioTracks.value = tracks' jellyfinItem`.
  - artist: albums built like Task 1's album items from tracks whose `AlbumArtists` contain `itemId`; `item = { Id, Name, Type: 'MusicArtist' }`.
  - Offline movie/episode branch: `offlineProgressSeconds = effectiveProgress(cached.jellyfinItem, local).position` when not played and under 90 %.
  - Artwork: include `AlbumId` targets in `preloadCachedArtwork` for these items.
- [ ] **Step 2: Run** type check + tests → clean.
- [ ] **Step 3: Commit** `feat(offline): album and artist pages work offline`.

### Task 9: Offline home

**Files:**
- Create: `src/components/offline/OfflineHome.vue`
- Modify: `src/pages/MediaList.vue` (offline → render `<OfflineHome />` instead of the server sections; skip `loadMedia()` and its retry while offline)
- Modify: `src/locales/fr.json`, `en.json` (`home.seeAllDownloads`: "Tout voir dans la bibliothèque" / "See all in the library"; time-left text reuses `formatDuration`)

**Interfaces:**
- Consumes: `resumeCandidates` (Task 2), `localLibraryPage` + `downloadsInLibrary` + `downloadedTracks` (Task 1), persisted libraries (Task 3), `OfflineBanner` + `useOfflineArtwork` (Task 5), `offlineDatabase.getWatchProgress`.

- [ ] **Step 1: Implement** (mockup 5B): `<OfflineBanner />`; "Reprendre" (`home.continueWatching`) rail of `resumeCandidates` cards with progress bar and time left, tapping plays (`router.push({ name: 'Player', params: { id } })`); then **one section per music library with downloads**, titled with the library name, showing its downloaded albums (`localLibraryPage(…, 'albums', 'music', …)`) and an "Aléatoire" button (`library.music.shuffleAll`) shuffling that library's downloaded tracks; finally a link `home.seeAllDownloads` to `libraryList`. Sections without content are not rendered.
- [ ] **Step 2: Run** type check + tests → clean.
- [ ] **Step 3: Commit** `feat(offline): offline home with resume and music per library`.

### Task 10: Téléchargés tab as a management page

**Files:**
- Modify: `src/pages/OfflineLibraryPage.vue` (rewrite as management; drop its series/season/album browsing sub-views)
- Modify: `src/store/download-store.ts` (`DownloadTask` gains `metadata?: any`, `groupId?: string`, `groupName?: string`; add `retry(itemId)`)
- Create: `src/utils/downloadGroups.ts` + `src/utils/downloadGroups.test.ts`
- Modify: `src/App.vue:158-166` (back button: exit the app on the `offline` route only when it has no history, like other tabs)
- Modify: `src/locales/fr.json`, `en.json` (`downloads.onDevice` "{size} sur l'appareil", `downloads.browse` "Parcourir", `downloads.inProgress` "En cours", `downloads.failed` "Échec", `downloads.stored` "Sur l'appareil", `downloads.retry` "Réessayer", `downloads.tracksOf` "{done} titres sur {total}", `downloads.episodesCount` "{n} épisode | {n} épisodes"; reuse existing `downloads.*` keys where they already say the same)

**Interfaces:**
- Produces:
  - `groupActiveTasks(tasks: DownloadTask[]): { key: string; name: string; done: number; total: number; progress: number; itemIds: string[] }[]` — `Audio` tasks with the same `groupId` (album) form one row; others one row each.
  - `groupStored(downloads: DownloadedMedia[]): { key: string; kind: 'movie' | 'series' | 'album'; name: string; count: number; size: number; itemIds: string[]; imageId: string }[]` — movies alone, episodes by series, tracks by album (loose tracks alone).
  - `storageByKind(downloads): { movies: number; series: number; music: number; total: number }` (bytes).
  - `downloadStore.retry(itemId: string): Promise<void>` — restarts a failed task from its kept `metadata`.

- [ ] **Step 1: Write the failing tests** `downloadGroups.test.ts`: `groups an album's tasks into one row` (5 completed + 3 running of `groupId 'al1'` → `done 5, total 8`), `groups stored episodes by series and tracks by album`, `sums storage by kind`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the helpers; in `_executeDownload` keep `metadata` and set `groupId/groupName` (`AlbumId`/`Album` for `Audio`) on the task; `retry()`; the page per mockup 4: storage summary + "Parcourir" (→ `libraryList`), "En cours · n" rows with progress bar and cancel (cancel every `itemIds`), "Échec · n" rows with the error and "Réessayer", "Sur l'appareil" rows with size and delete (confirm, then `deleteOfflineFile` + `removeDownload` for every `itemIds`); keep the existing "Tout supprimer".
- [ ] **Step 4: Run** tests + type check → clean.
- [ ] **Step 5: Commit** `feat(downloads): Téléchargés tab becomes a management page`.

### Task 11: Device verification and notes

**Files:**
- Create: `docs/session-progress/2026-10-2x-offline-library.md`

- [ ] **Step 1: Build** `docker build -f Dockerfile.android --target apk --build-arg ANDROID_VERSION_CODE=26 --output type=local,dest=./out/apk-fix .`, install on the tablet (`adb-RCSW55JRUCZT9P9X-Y5KyBU._adb-tls-connect._tcp`) and the Pixel (`adb-57291FDCR00223-Okwjyx._adb-tls-connect._tcp`).
- [ ] **Step 2: Online checks**: filter on each library type (counts, sort, genres, A–Z, Playlists hidden); album opened from the filtered grid shows the full server album; Téléchargés tab: album as one "x titres sur y" row, cancel, retry after a failure, delete removes files (`adb shell find /sdcard/Documents/Vela -type f`).
- [ ] **Step 3: Offline checks** with `cmd connectivity set-chain3-enabled true; cmd connectivity set-package-networking-enabled false cloud.valgrind.vela`: home B (Reprendre, one row per music library, Aléatoire), library list (only libraries with downloads, banner), Musiques → Artistes → artist → album → play, Films → movie → play; cut the network while a library page is open with the filter off (Review Focus 5); same with the Settings "force offline" switch.
- [ ] **Step 4: Sync checks**: watch 2 min of a downloaded episode offline, reconnect, position visible in Jellyfin web; advance the same episode further on another client, reconnect the device → the newer position wins both ways.
- [ ] **Step 5: Write the session note** (what was done, results, what is left) and **commit** `docs: offline library session notes`.
