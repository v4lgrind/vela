# Offline library — design

Date: 2026-10-23 · Status: draft, builder check done, awaiting user approval
Mockups: https://claude.ai/artifact/8pz6nP1bv3U4gv9HSsAZiK (6 phone screens, dark theme)

## Intent

The user takes Vela on a plane and wants to "find my music easily and start listening, or
find my media easily". Today, offline, the app forces everything onto the Téléchargés page
(`OfflineLibraryPage`), which lists every song as its own card: no albums, no artists, none of
the organisation of the normal library.

The model the user likes is Apple Music's "Téléchargée" category, which shows only downloaded
media but organised exactly like the regular library. The user's twist: no separate
category, a **filter button** on the regular library pages ("ça confond un peu les deux juste
avec un bouton qui filtre").

So the work splits the current Téléchargés page in two:
- **browsing** downloaded media moves into the regular library pages, behind a
  "Téléchargés" filter;
- the **Téléchargés tab** becomes a management page (progress, failures, storage, delete).

## Goals

1. **"Téléchargés" filter** on every library page (`LibraryItemsPage`), next to the existing
   quick toggle (Favoris for music, Non vus for video).
   - Online: off by default; the user can turn it on.
   - Offline: on, and cannot be turned off (it shows the offline icon instead of the download
     icon, with a short "Hors ligne : le filtre reste activé." line under the row).
   - The page keeps its normal organisation: Albums / Artistes / Titres / Playlists for music,
     the poster grid for films and series, the sort sheet, genres, A–Z index.
   - Header count reflects the filter ("3 albums téléchargés").
   - The Playlists tab is hidden while the filter is on (playlists are never downloaded as a
     unit). (User decision.)
2. **Offline library list** (`LibrariesPage`): the user's real libraries, remembered while
   online. Offline, only libraries holding at least one download are shown, with an
   "Hors ligne · seuls tes téléchargements sont affichés" banner. Tapping one opens
   `LibraryItemsPage` with the filter on.
   - Why real libraries and not "Films / Séries / Musique" by type: the user has both
     "Musiques" and "Livres Audio", both of Jellyfin type music; grouping by type would mix
     them. (User decision.)
3. **Téléchargés tab = management page** (mockup 4):
   - storage summary ("12,6 Go sur l'appareil", split Films / Séries / Musique) with a
     "Parcourir" link to the library list (filter on);
   - **En cours**: one row per running download (an album counts as one row: "5 titres sur
     8"), progress bar, cancel button;
   - **Échec**: failed downloads with the reason and "Réessayer";
   - **Sur l'appareil**: what is downloaded, music grouped by album, series grouped by
     series ("4 épisodes"), each with size and a delete button.
4. **Offline home** (`MediaList`), version B of the mockups (user choice):
   - "Hors ligne · seuls tes téléchargements sont affichés" banner;
   - **Reprendre**: downloaded movies/episodes that are started and not finished, with
     progress bar and time left;
   - **one row per music library holding downloads** ("Musiques", "Livres Audio"…), each
     with its downloaded albums and its own "Aléatoire" button shuffling that library's
     downloaded tracks only (user decision, same rule as the per-library shuffle in the app
     and Android Auto: audiobooks never mix into music);
   - "Tout voir dans la bibliothèque" link.
5. **Watch progress offline, synced back** (user: "faut mémoriser l'avancement … et quand on
   chope la co il faut synchro avec jellyfin"):
   - video position is kept on the device while offline (already done, see Current state);
   - when the connection returns, positions and "watched" state are pushed to Jellyfin;
   - while online, the stored progress of every downloaded item is refreshed from Jellyfin
     (one request for all downloaded ids), so a downloaded episode advanced on the TV shows
     the right position on the plane;
   - **conflict rule (user decision): the most recent playback wins**, compared on the
     local `lastWatched` timestamp vs Jellyfin's `UserData.LastPlayedDate`.
6. **Detail pages work offline** from local data: album page (downloaded tracks only),
   artist page (downloaded albums only), series and season pages (downloaded episodes only).
   Online, detail pages stay as today (full album / series from the server, downloaded
   tracks and episodes marked with the blue download icon), even when opened from a filtered
   list. (User decision.)

## Non-goals

- Searching downloads from the Recherche tab.
- Auto-downloading next episodes, smart downloads, storage limits.
- Tracking music listening position or play counts offline.
- Tablet-specific or light-theme mockups: the existing responsive layout and theme tokens
  apply as they are.

## Anti-goals (failure even if it "works")

- A separate "offline mode" UI that looks different from the normal library.
- Offline screens that spin, show a server error, or an empty library tile.
- Losing a position watched on the plane, or overwriting a newer position from another device.

## Current state (what exists, 2026-10-23)

- `offlineDatabase` (IndexedDB `JellyfinOffline`): store `downloads` (`DownloadedMedia`, which
  keeps the full Jellyfin item in `jellyfinItem`, including `UserData`, genres, artists) and
  store `watchProgress` (`position`, `percentage`, `completed`, `lastWatched`, `synced`).
- `useOfflinePlayer` saves video progress to `watchProgress` (every 10 progress events of the
  native player, on pause and stop).
- `syncService.syncWatchProgress` pushes unsynced progress when the device comes back online,
  with `POST /Sessions/Playing/Stopped` (no prior start report). **Never verified against the
  user's server** (Jellyfin 12); it may be ignored.
- Router (`src/router/index.ts`): offline, `libraries`, `libraryList` and `libraryItem` are
  redirected to `offline`.
- `jellyfin-store.fetchLibraries` reads `/UserViews`; nothing is cached.
- A download record does not know its library: `jellyfinItem.ParentId` is the album / season
  folder, not the library.

## Decisions made with the user

- Filter button on the regular pages, not a separate "Downloaded" category.
- Téléchargés tab = management only.
- Offline home = version B (banner + Reprendre + Ta musique).
- Progress kept offline and synced; the most recent playback wins.
- Remember the real libraries (not grouping by type).
- Offline home: one "Ta musique"-style row per music library, each with its own shuffle.
- Online, filter on: tapping an album / series opens the full server page with download icons.
- Filter on: Playlists tab hidden.

## Calls made by Claude (to check)

- A partly downloaded album appears, showing only its downloaded tracks; same for a series
  (only downloaded seasons / episodes).
- When the filter is on, lists are built **from local data in both online and offline
  modes**, not by asking the server for the downloaded ids. One code path, identical results
  on the plane; sorting, genre filter and A–Z are applied locally on `jellyfinItem` fields.
- Each download records its library id at download time (required: the offline library
  list and the per-library home rows depend on it). Downloads made before this change
  get it back-filled the next time the app is online (Jellyfin `Ancestors` of the item, or
  matching the library list).
- The library list is cached on every successful `fetchLibraries` (persisted store), with
  each library's name, collection type and image tag; library images are cached like other
  offline artwork.
- Offline, the shuffle button of a music library shuffles only downloaded tracks.
- Filter state online is remembered per library for the session (like the other filters,
  `sessionStorage`), not across launches.
- Sync uses the Jellyfin endpoint that writes user data directly (position, played,
  last-played date) if `/Sessions/Playing/Stopped` turns out not to stick.
- "Reprendre" offline = started and under 90 % (the threshold `useOfflinePlayer` already uses
  for `completed`), most recent first.

- "Parcourir" on the Téléchargés tab opens the library list: online the normal list,
  offline the filtered one (no extra "downloads only" mode for the online list).
- The Settings "force offline" switch (`forceOfflineMode`) triggers the whole offline
  experience (filter locked on, offline home, banner, offline detail pages) exactly like a
  real loss of connection; every check goes through one "is offline" helper.
- Backfilling the size of downloads stored as 0 B (made before the size fix) is in scope,
  since the storage summary depends on it (native size lookup of the `content://` file).

## Preconditions

- The uncommitted work of 2026-10-23 (library shuffle, library page rework, filters, download
  fixes) is committed first; this feature starts from that base on its own branch.

## Left to the builder

- Component structure and how `LibraryItemsPage` switches between server and local data.
- Where the cached library list lives (new store or `offline-store`).
- How the router guard changes (offline should no longer redirect library routes to
  `offline`).
- What happens to `OfflineLibraryPage`'s existing sub-views (series/season/album browsing):
  removed once the library pages cover them.
- Exact copy, beyond the strings in the mockups.

## Verification

On the tablet and the Pixel, over wireless adb, with app networking cut
(`cmd connectivity set-package-networking-enabled false cloud.valgrind.vela`):
- airplane flow: home B → Ta musique → album → play; library list → Musiques → Artistes →
  artist → album → play; Films → movie → play;
- watch 2 min of a downloaded episode offline, reconnect, check the position in Jellyfin (web
  UI); advance the same episode on another client, reconnect the device, check the newest
  wins both ways;
- online: toggle the filter on each library type, counts and sort/genre filters correct;
- Téléchargés tab: album download shows as one row with "x titres sur y", cancel, retry
  after a failure, delete removes the files (`Documents/Vela` on the device).
