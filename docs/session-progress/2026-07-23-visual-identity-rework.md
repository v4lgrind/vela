# 2026-07-23 — Visual identity rework (icons / splash / favicon)

## Goal
Rework the app's visual identity — **the marks and assets** (app icons, splash
screens, favicon), not the in-app theme/color tokens. Chosen direction:
- **Symbol:** abstract media/play pictogram (no letter).
- **Palette:** align with the app's real design system (OLED black `#000` +
  blue accent `#2f9bff`), replacing the old off-brand purple "J".

## What was found
- Old identity: a purple-gradient **"J"** (Jellyfin) on navy `#0f0f1e`, which
  did **not** match the app's OLED-black + blue-accent direction
  (`design-mockups/_theme.css`).
- Assets are hand-maintained rasters (the repo ships pre-generated
  `@capacitor/assets` output). `sharp`/`@capacitor/assets` can't rebuild here
  because the prebuilt `libvips` download is blocked by the proxy.

## New mark — "Stream Play"
Rounded **play triangle** inside a **~320° progress ring** (gap at top, a nod
to a player's scrub ring), blue→cyan gradient (`#6FDCFF → #35A6FF → #2F86FF`)
with a soft glow, on OLED black. Reads clearly as a media player from 1024px
down to a 48px favicon, and sits safely inside the Android adaptive safe zone.

## Changes made
- **Vector sources added** in `assets/brand/` (`icon.svg`, `icon-round.svg`,
  `adaptive-foreground.svg`, `adaptive-background.svg`, `favicon.svg`) plus a
  reproducible pipeline (`generate.mjs` + `build.sh`) and `README.md`.
- **Regenerated rasters** at their exact existing dimensions:
  - `assets/icon.png` (1024), `assets/splash.png` / `assets/splash-dark.png`
    (1080×1920).
  - `icons/icon-{48,72,96,128,192,256,512}.webp` + `icon-512.png` (web/Electron).
  - `public/favicon.svg`.
  - Android: all `mipmap-*` `ic_launcher` / `ic_launcher_round` /
    `ic_launcher_foreground` / `ic_launcher_background`, and all 24
    `drawable-*/splash.png` (port/land × density × light/night).
  - `values/ic_launcher_background.xml`: adaptive-icon background `#FFFFFF → #000000`.

## Tooling note
Built with `rsvg-convert` (librsvg) + `cwebp` instead of `sharp`, because the
`sharp` prebuilt binary/libvips can't be fetched through the agent proxy.
`assets/brand/build.sh` documents and reproduces the whole process.

## Next steps / to verify
- Run `npx cap sync android` and build a debug APK to confirm the launcher
  icon + splash render on-device (couldn't run a device build here).
- Optional: the `public/manifest.webmanifest` still declares the `.webp`
  icons with `"type": "image/png"` (pre-existing) — could be corrected to
  `image/webp` in a follow-up.
