# 2026-10-23 — "Shuffle all" for a music library (app + Android Auto)

## Request
A button to shuffle ALL the music, in the app and in Android Auto.

## Finding
"Livres Audio" (751 tracks) is a Jellyfin `music` library like "Musiques"
(1217). A shuffle over every Audio item mixed audiobook chapters in, so the
shuffle is scoped to one library.

## Changes
- App: "Lecture aléatoire" button in the header of a music library page
  (`LibraryItemsPage.vue`). Loads 300 random songs of that library
  (`jellyfin-store.fetchRandomTracks(libraryId)`), store flag
  `libraryShuffle` = library id (persisted).
- Refill: `audioPlayerService` watches the queue; ≤5 tracks left → 300 more,
  minus those already queued (`freshTracks`, new round if all were).
- Android Auto: one playable "Aléatoire : <library>" entry per music library
  at the top of the root (`shuffle:<libraryId>`). `MusicService` tops up a
  car-started shuffle itself and broadcasts `externalQueue` so the app adopts
  the longer queue; the app clears its own flag when adopting a car queue.

## Verified (Pixel 10, APK versionCode 14)
- Button shows on Musiques; tap → 300 tracks queued, playing.
- skipTo(296) → queue grew to 520, all unique; all paths under /music/.
- 165/165 unit tests, type check clean.

## Not yet done
- Android Auto entry not tested in a car (no head unit here).
- Tablet not updated (adb not connected).
- Not committed.

---

# Same day — library page rework

- `LibraryItemsPage.vue`: compact header (`PageHeader compact`, 20 px title),
  subtitle = total of the open tab (`library.count.*`, from
  `TotalRecordCount`), infinite scroll (IntersectionObserver sentinel,
  50 per page) replacing Previous/Next, round icon shuffle button.
- `App.vue`: `<keep-alive include="LibraryItemsPage" :max="3">` keyed by
  path → back from an album keeps loaded items + scroll. The page reloads
  on activation unless coming back from ItemDetails / libraryItem /
  PersonDetail / Player, or when the last load failed/was empty.
- Verified on the Pixel (v16): "108 albums", "1217 titres" 50→550 while
  scrolling, back from an album at y=3000 → same y, 108 items.

# Expanded audio player in light theme

- Player background was hard-coded dark while using theme tokens → dark
  icons on dark in light theme. User wants the player to follow the app
  theme: `main.css` `--audio-player-bg` (dark: original gradient, light:
  pale blue → background) + `audio-player-bg` utility; title
  `text-text-heading`, play button `bg-text-heading text-background`; top
  buttons spaced (`gap-2`). Verified by screenshot in light theme (v18).

# Filters redesign (option B without segments)

- Mockups (3 options) in the canvas artifact https://claude.ai/artifact/DiEnVsUVS9fEvrd4E7MZNL ;
  user picked B minus the Tous/Non vus/Favoris segments, plus a quick
  "Non vus" button.
- `LibraryItemsPage.vue`: row = quick toggle (Non vus; Favoris in music),
  summary of active sort/filters, view toggle, filters button with badge.
  Bottom sheet (`ui/drawer`, vaul): sort chips, order, Non vus / Favoris,
  multi-genre chips, "Voir N …" button; changes apply live. Native
  `<select>`s and the "Vus" filter are gone. Drawer z-index raised to 200
  (above mini player).
- Verified on Pixel (light) and tablet (dark), v20.

# Stuck "Impossible de charger vos bibliothèques" after locking

- Android blocks a backgrounded app's network (lock / Doze) without an
  `offline` event, so failed loads were never retried. Repro: per-app
  firewall (`cmd connectivity set-chain3-enabled true` +
  `set-package-networking-enabled false cloud.valgrind.vela`), force-stop,
  start, re-enable → error stayed.
- `src/composables/useRetryWhileFailed.ts` (+ test): retries on return to
  foreground, `online`, and every 5 s while failed. Used by MediaList,
  LibrariesPage, LibraryItemsPage (which now shows its error), and the
  mini/expanded player covers (img re-mounted after an error).
- Verified on the Pixel (v21): home recovers by itself. Cover retry not
  checked on device.

# Single-song download

- `TrackActionsMenu.vue` takes an optional `track` (Jellyfin Audio item) and
  then offers Télécharger / Annuler / Supprimer le téléchargement, using the
  existing `downloadStore.startDownload` (Audio type) and
  `downloadService.deleteOfflineFile` + `offlineStore.removeDownload`.
- Wired in album/playlist track rows (`ItemDetailsPage`) and the Titres tab
  (`LibraryItemsPage`, which now shows the downloaded/downloading icon).
- Verified on the Pixel (v22): "1825" downloaded (50 MB, icon shown), then
  removed through the menu + confirm dialog.

# Downloads shown as 0 B

- Android native downloads are stored through MediaStore and come back as
  `content://media/...`; `Filesystem.stat` throws on those ("getString(...)
  must not be null"), so `fileSize` was saved as 0 — for every Android
  download (films too), not only songs.
- `downloadService.ts`: `downloadAndroidFile` now resolves
  `{ filePath, fileSize }` with the size from the native `downloadComplete`
  event; `stat` is only a fallback.
- Verified on the tablet (v23): Adagio re-downloaded → 24.24 MB.
- Downloads made before this fix keep 0 B in the DB (no backfill).

# Download test pass (tablet, v23 → v25)

Passed as-is: song download, cancel at 41 % (partial file removed), re-download
after cancel, offline playback, persistence after restart.

Fixed:
- **Delete left the file on disk.** `deleteOfflineFile` stat'ed first, which
  throws on `content://` → deletion silently skipped (films too). New native
  `Download.delete({ uri })` (`contentResolver.delete`), used by
  `downloadService.deleteFile` for `content://` paths; stat pre-check removed.
- **Album download never worked.** `/Items/{albumId}/Download` → HTTP 400, and
  the failure was silent. `ItemDetailsPage` now treats an album as its tracks
  (`downloadIds`): download each missing track, downloaded = all tracks,
  delete/cancel apply to every track, progress = average.
- **Queue race** (pre-existing): `_executeDownload` marked a task
  "downloading" only after `await fetchItemDetails`, so bulk starts (album,
  season) launched the same item several times ("Download already in
  progress" → failed) and ignored the 3-at-a-time cap. Status is now set
  before the await; a cancel during that await is honoured. Test in
  `download-store.test.ts`.
- **Failed downloads were silent everywhere.** The store now toasts
  "Impossible de télécharger « name »" (not on cancel).
- **Offline, the player raced through the queue.** Native audio errors now
  carry `code` (`errorCodeName`); on `ERROR_CODE_IO_NETWORK*` the service
  jumps to the next downloaded track, else pauses with
  `audio.offlineNoNext`. Other errors still skip to the next track.

Verified on the tablet (v25): album of 8 tracks downloads 3 at a time with
0→100 % progress and no false error, album delete removes all 8 files,
offline end-of-track jumps from #2 to the downloaded #50, pauses with the
message when none, offline download → toast after 15 s, retry online works.

## Open
- Not committed (library shuffle, page rework, player theme, filters, retry,
  song download, download fixes).
- Orphan files from before the delete fix remain on the tablet
  (`Documents/Vela/Music/SLUMB/Plague/Adagio.flac`, `Adagio (1).flac`,
  `Nils Hoffmann/Afterglow/Afterglow.flac`); old downloads keep 0 B.
- Mini player play/next buttons have no aria-label.
- Android Auto shuffle entries untested in a car.
