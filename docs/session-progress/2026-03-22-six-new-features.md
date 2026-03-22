# Session Progress — 2026-03-22 — Six New Features

## Overview

Implemented 6 new features across the Jellyfin Android client. Each was committed and pushed
individually after user confirmation on device.

---

## Feature 1: Next Episode Button ✅

**Goal:** Show a "Next Episode" button in the last 60 seconds of an episode inside the native player.

**Files changed:**
- `src/pages/ItemDetailsPage.vue` — `playEpisode()` now resolves the next episode in the sorted
  list and passes `nextEpisodeId` as a route query param
- `src/plugins/NativeVideoPlugin.ts` — added `nextEpisodeId?: string` to `NativeVideoStartOptions`
- `src/pages/PlayerPage.vue` — reads `nextEpisodeId` from route query; if absent (navigation from
  Continue Watching), fetches it by calling `store.fetchItemDetails()` + `store.fetchEpisodes()` in
  parallel with `fetchPlaybackInfo()`; handles `nextEpisode` broadcast → `router.replace`
- `android/.../NativeVideoPlugin.kt` — extracts `nextEpisodeId`, adds to intent, handles
  `ACTION_NEXT_EPISODE` broadcast
- `android/.../NativePlayerActivity.kt` — `btn_next_episode` button, shown when
  `remainingMs ≤ 60 000 && nextEpisodeId.isNotEmpty()`
- `android/res/layout/activity_native_player.xml` — `btn_next_episode` at `bottom|start`

**Bug fixed during implementation:** inner `val dur = player?.duration` shadowed the outer
coerced `dur`, causing HLS streams (where `player.duration` returns `C.TIME_UNSET`) to never
show the button. Removed the inner declaration.

---

## Feature 2: Long-Press Scrubbing ✅

**Goal:** Long-press anywhere on the video → enter scrub mode → drag to seek → release to confirm.

**Files changed:**
- `android/.../NativePlayerActivity.kt` — `onLongPress` in `GestureDetector` starts scrub;
  `dispatchTouchEvent` handles `ACTION_MOVE` (seek + overlay update) and `ACTION_UP/CANCEL`
  (end scrub, restore controls); `isTapOnInteractiveView` guards prevent triggering on buttons
- `android/res/layout/activity_native_player.xml` — `tv_scrub_overlay` centered `TextView`

---

## Feature 3: Full-Screen Search Page ✅

**Goal:** `/search` page with results grid and type filter tabs (All / Movies / TV Shows / Episodes).

**Files changed:**
- `src/pages/SearchPage.vue` — **new file**; full-screen page with own header (back + input),
  filter tabs, 3-column grid, episode/poster aspect ratios
- `src/router/index.ts` — added `/search` route
- `src/components/SearchBar.vue` — "See all results →" button at bottom of dropdown; Enter key
  navigates to search page when no item is highlighted; `activeIndex` starts at -1
- `src/App.vue` — `v-if="isAuthenticated && route.name !== 'search'"` on `<SearchBar>` to
  prevent duplicate nav bar on the search page

---

## Feature 4: Swipe Down to Dismiss Player ✅ → later removed ❌

**Goal:** Fast downward fling closes the native player.

Initially implemented via `onFling` in `GestureDetectorCompat`. User confirmed it worked, then
later asked to remove it. The `onFling` override was deleted in a separate commit.

---

## Feature 5: Intro/Credits Skip for Offline Downloads ✅

**Goal:** Fetch intro/outro timestamps at download time, store them offline.

**Files changed:**
- `src/services/offlineDatabase.ts` — `introSegments` field on `DownloadedMedia`; DB version
  bumped to 2
- `src/services/downloadService.ts` — fetches `/MediaSegments/{id}` after file download completes
- `src/pages/PlayerPage.vue` — in `initOfflinePlayer()`, calls `NativeVideo.setIntroTimestamps()`
  if stored segments include an Intro entry

---

## Feature 6: Robust Background Downloads ✅

**Goal:** Downloads survive app backgrounding; show persistent notification; retry on error;
persist queue across app restarts.

**Files changed/created:**
- `android/.../DownloadService.kt` — **new** `ForegroundService`; `HttpURLConnection` streaming;
  `LinkedBlockingDeque` queue; `SharedPreferences` persistence; `PARTIAL_WAKE_LOCK`; 3 retries
  with exponential backoff; progress notification; broadcasts progress/complete/failed via
  `LocalBroadcastManager`
- `android/.../DownloadPlugin.kt` — **new** Capacitor plugin (`@CapacitorPlugin(name="Download")`);
  `enqueue()` / `cancel()` methods; forwards LBM broadcasts to JS via `notifyListeners()`
- `src/plugins/DownloadPlugin.ts` — **new** TypeScript interface
- `src/services/downloadService.ts` — replaces `Filesystem.downloadFile()` with
  `DownloadPlugin.enqueue()` wrapped in a Promise that resolves/rejects from native events
- `android/app/src/main/AndroidManifest.xml` — `FOREGROUND_SERVICE_DATA_SYNC` permission +
  `<service>` registration
- `android/.../MainActivity.java` — `registerPlugin(DownloadPlugin.class)`

---

## Commits in this session

| Hash | Description |
|---|---|
| (prev session) | feat: intro/credits skip for offline downloads (#5) |
| fa1b114 | (existing) ffmpeg decoder offline track selection |
| (this session) | feat: next episode button in native player (#1) |
| (this session) | feat: long-press scrubbing in native player (#2) |
| (this session) | feat: full-screen search page with type filters (#3) |
| (this session) | feat: swipe-down to dismiss player (#4) |
| 33e61ff | feat: robust background downloads via Android ForegroundService (#6) |
| d2ba7b6 | remove swipe-down to dismiss player gesture |

---

## What's left / possible next steps

- Background download queue resume after app kill: currently, if the app is killed mid-download
  and the service completes the file while the app is dead, the DB save and artwork cache steps
  are skipped (file on disk, no DB record). A queue-reconciliation pass on `offlineStore.init()`
  could fix this.
- Download notification cancel action: the `DownloadService` notification could include a
  "Cancel" action button to cancel the current download from the notification shade.
- Next episode chaining across season boundaries (current impl only chains within the same
  season's sorted episode list).
