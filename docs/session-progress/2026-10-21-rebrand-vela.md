# 2026-10-21 — Rebrand: "Jellyfin V4lgrind" → "Vela"

## Why
Goal: a public release (direct APK first, Play Store later) with a professional name and logo.
"Jellyfin" must not be the main name (trademark / impersonation) → "Vela", with "for Jellyfin"
only in descriptions. Name availability on the Play Store is not a blocker.

## Decisions
- **Name:** Vela (Latin for "sail" + a constellation).
- **Logo:** "Voile d'étoiles" (direction C3 on the canvas
  https://claude.ai/artifact/SsVS59muxqkBEQ2wqBN7pQ): stars tracing a sail shaped like
  a play triangle. Background `#04121F`, white stars `#F5F8FA`, blue stars `#2F9BFF` (the app's accent).
- **Package ID:** `com.jellyfin_v4lgrind_client.app` → `cloud.valgrind.vela` (locked in
  before the first public release). Consequence: uninstall/reinstall once, list of
  downloads lost.
- **Offline folder:** `Documents/Jellyfin V4lgrind` → `Documents/Vela` (desktop too).

## Changes
- Android: `applicationId`/`namespace`, Kotlin/Java sources moved to `cloud/valgrind/vela`,
  broadcast actions, `strings.xml`, `capacitor.config.ts`.
- Name: index.html, package.json, LoginPage, `clientName` sent to Jellyfin
  ("Vela Android/Desktop/Web"), Electron (`appId`, `productName`, AppUserModelId),
  workflows (APK name `Vela-<version>-android.apk`, release title), README.
- Icon: adaptive vector (`drawable/ic_launcher_foreground.xml`), monochrome
  (`drawable/ic_launcher_monochrome.xml`, Android 13 themed icons), background color
  `ic_launcher_background`; legacy PNGs, splash (glyph on black + `windowSplashScreenBackground`),
  favicon.svg, `icons/` (desktop/web), `assets/`. Removed the old fg/bg PNGs and the
  template `drawable-v24/ic_launcher_foreground.xml`.
- The assets are produced by a Python/PIL script (geometry = mockup C3, scale 0.64 in the
  108dp viewport, centered at (53,50)). The script was not committed; the vector
  `ic_launcher_foreground.xml` holds the reference coordinates.

## Left to do
- Test on the tablet: uninstall the old app, install the APK, check the icon
  (circle/squircle mask, themed icon), the splash, Android Auto.
- Leftover not touched: `drawable/ic_launcher_background.xml` (template grid, unused).
  Signing key: alias/password `mediaserver` kept on purpose (in-place updates).
- Local folder `~/projects/mediaserver-client` not renamed (Claude memory is tied to the path).

## Brand everywhere (same session)
- GitHub repo renamed `v4lgrind/mediaserver-client` → `v4lgrind/vela` (GitHub redirects the
  old URL), description added, `origin` remote updated.
- APK: `mediaserver-client.apk` → `vela.apk` (build.gradle, Dockerfile.android, CI workflows, README).
- AirPlay receiver name and Android Auto root: "Jellyfin" → "Vela". CLAUDE.md mentions Vela.
- APK `versionCode 2` installed and launched on the Pixel 10 and the OnePlus Pad (adb Wi-Fi):
  "Vela" login screen OK. The old app `com.jellyfin_v4lgrind_client.app` is still
  installed next to it.
- Later, for the Play Store: 512 px icon, feature graphic, "Vela for Jellyfin" listing.

## Removed automatic switch to offline mode (same session)
- User complaint: the app was switching into offline mode by itself at the wrong times.
- Cause: `offlineDetection` pinged `/System/Info/Public` every 30 s (5 s timeout);
  one slow or failed reply → `isFullyOnline=false` → redirect to the offline library.
- User choice: offline mode = **Settings toggle** or **no network on the device**
  (airplane mode, `online`/`offline` events). Server ping removed entirely.
- Files: `src/services/offlineDetection.ts` (ping, `serverReachable`, `init` removed),
  `src/store/offline-store.ts` (detection init + `serverReachable` getter removed),
  router comment. Test: `src/services/offlineDetection.test.ts`.
- Side effect: when the server is down but the network is up, the pages show a loading
  error instead of switching to offline.
