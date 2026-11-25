# 2026-11-25 — Home: drop the "My libraries" row

## Found
- On a Plex server the home page's last section ("My libraries") rendered
  broken tiles (question-mark placeholders): Plex libraries have no 16:9 tile art.
- The row is redundant now that the bottom nav has a Libraries tab.

## Changes
- `src/pages/MediaList.vue`: removed the "My libraries" section and the
  unused `LIBRARY_TILE` size. The first-load skeleton and the load-error
  message lived inside that section; they now sit at the top of the page.
- Removed the `home.myLibraries` string from `en.json` / `fr.json`.

## Verified
- `npm run build` (vue-tsc + vite) passes; `vitest`: 426/426 pass.
- Not checked on a device (no emulator on this VM).

## Next
- Check on the phone that the home page ends after the "Recently added" rows
  and that the first load (empty cache) shows the skeleton.
