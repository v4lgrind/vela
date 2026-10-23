# 2026-10-23 — Offline library

Spec: `docs/superpowers/specs/2026-10-23-offline-library-design.md`
Plan: `docs/superpowers/plans/2026-10-23-offline-library.md`
Branch: `feat/offline-library` (not merged)

## What was built

- **"Téléchargés" filter** on every library page: lists downloaded media from the
  device (`src/utils/offlineLibrary.ts`) with the usual albums / artists / songs /
  poster grid, sort, genres, A–Z. Forced on and locked offline; Playlists hidden;
  shuffle uses the library's downloaded tracks; the page switches data source when
  the connection changes.
- **Library of each download**: `DownloadedMedia.libraryId`, found from Jellyfin
  ancestors (`pickLibraryId`), backfilled at start / after a download / back online.
  Library list persisted (`jellyfin-store` `libraries`), tiles cached.
- **Offline library list**: only libraries holding downloads, offline banner.
- **Offline home**: banner, Reprendre (started videos < 90 %, most recent first),
  one row per music library with its own shuffle, link to the library.
- **Album / artist pages offline** from local data.
- **Progress sync** (`syncService`): reads `/UserItems/{id}/UserData`, pushes the
  offline position unless Jellyfin has a newer playback (`shouldPushLocal`); then
  refreshes the user data of every download. Display uses `effectiveProgress`
  (most recent wins).
- **Téléchargés tab = management**: storage summary, running downloads (an album =
  one "x titres sur y" row), failures with Réessayer / Retirer, stored items grouped
  by movie / series / album with size and delete.
- Sizes of old 0 B downloads backfilled (native `Download.size`); album covers
  cached with tracks.
- Fixes found on the way: `addDownload` stores a plain JSON copy (reactive fields
  could not be cloned); library tiles blank offline; tablet nav rail ran under the
  status bar (user report).

## Verified on the tablet (v26/v27)

- Library ids: album → Musiques, audiobook → Livres Audio, episodes → Séries.
- Online filter: Musiques 1 album / 1 artist / 8 titres, Playlists hidden.
- Offline (force offline + app network cut): home B, library list with images,
  Musiques locked filter, artist → album → playback from the local file, Séries →
  episode played offline, Reprendre "Reste 6 min", resume at the saved position.
- Sync: offline 114 s pushed to Jellyfin with the offline date; a newer position
  written by "another device" (300 s) wins afterwards ("Reprendre · 5 min").
- Going offline with a library page open: 171 → 1 element, no error, back to 171.
- Téléchargés tab: album row "4 titres sur 8 · 50 %", delete removes the files.
- Pixel (v27): filter on Musiques shows the empty state, phone layout fine.

## Left / known

- Offline detection is `navigator.onLine` only: Wi-Fi without internet (plane Wi-Fi,
  captive portal) counts as online and pages show server errors. Not in the spec.
- A failed download takes ~2 min to reach "Échec" during an outage (3 native
  retries with 30 s timeouts); the Réessayer path is unit-tested only.
- Before the first backfill, a track without library id falls into the first music
  library, which is "Livres Audio" on this server.
- Old orphan files from before the delete fix remain (tablet: 2× Adagio; Pixel:
  2× 1825, 2× Keep Your Eyes Peeled).
- Not tested on device: a movie download, Android Auto.
