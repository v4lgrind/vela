# 2026-11-25 — Public README with screenshots

## Decisions (agreed with the owner)
- Screenshots show only freely licensed content: Blender Studio open movies (CC BY)
  and CC music from archive.org. No real server, no commercial artwork.
- 5 phone shots (home, film detail, film library, lyrics player, downloads) + 1 tablet
  hero (film detail, landscape). Dark theme, English UI, raw WebP in `docs/screenshots/`.
- README: badges, "Why Vela", Android first (Windows/Linux/Android TV as secondary),
  non-affiliation notice, "Bugs and ideas" section. No named comparison with other clients.
- GitHub description and topics updated; stray `undefined/player-web.png` removed.

## How the screenshots were made
- `~/.local/share/vela-dev/showcase/` (outside the repo): `server.mjs` fake Jellyfin with
  the showcase library, `shots.mjs` (static pages), `flows.mjs` (music + lyrics, downloads).
  See `~/.local/share/vela-dev/README.md`.
- Posters without an official version are crops of the film's Blender Studio header plus
  its logo. Credits: `docs/screenshots/CREDITS.md`.
- Downloads fail on the web build (no native filesystem); `flows.mjs` turns the failed
  tasks' domain items into finished downloads in the offline store before the capture.
- Captured with Playwright on the web build, not on a device: the native ExoPlayer screen
  is not shown.

## Noticed, not fixed
- Libraries tab (`/library`) on the web build showed broken image tiles against the fake
  server, although the image endpoint answers 200 JPEG. Not investigated.

## Next
- Optional: a native player screenshot from a real device.

## Follow-up: web and macOS dropped as targets
- Supported targets: Android, Windows, Linux. The app in a plain browser is a dev tool
  only (npm run dev, e2e, screenshots); `ClientPlatform` `web` → `dev`, identity
  "Vela Dev". Unused `public/manifest.webmanifest` removed.
- macOS branches removed (`usePlatform`, `desktop.d.ts`, download store, Electron
  `darwin`/`activate` handlers).
- Stale e2e assertion fixed ("Jellyfin Client" → "Vela" heading). vue-tsc, 426 unit
  tests and 5 e2e tests pass.
