# Desktop Windows/Linux setup

**Date:** 2026-07-16
**Branch:** `codex/desktop-windows-linux`

## Goal

Add Windows and Linux desktop builds without replacing the existing Capacitor
Android application, and keep the shared Vue frontend functional on desktop.

## Changes made

- Added an Electron shell with a sandboxed preload, context isolation, external
  navigation protection, and no Node.js access in the renderer.
- Added electron-builder targets:
  - Windows x64 NSIS installer.
  - Linux AppImage and DEB packages.
- Added a GitHub Actions matrix that builds Windows and Linux artifacts.
  - Pull requests build Android, Windows, and Linux to validate the branch but
    do not upload build artifacts.
  - Builds on `main` upload the APK, Windows installer, Linux AppImage, and
    Linux DEB artifacts for seven days.
  - Artifact cleanup keeps the latest builds independently for Android,
    Windows, and Linux instead of keeping only two artifacts globally.
- Added desktop platform detection and platform-specific Jellyfin client/device
  identity while retaining Android-only behavior for ExoPlayer, StatusBar, Cast,
  and the Android back button.
- Added a desktop media backend:
  - Downloads restricted to Electron's application data media directory.
  - Progress events and cancellation.
  - Atomic partial-file writes and cleanup.
  - File stat and deletion.
  - A secure `media://` protocol with byte-range responses for seeking.
- Routed offline audio/video and cached artwork through the desktop media
  backend.
- Added conservative desktop download compatibility rules:
  - Compatible MP4/WebM files remain direct downloads.
  - Unsupported containers/codecs request H.264/AAC MP4 transcoding from
    Jellyfin.
- Added a project icon to Windows and Linux packages.
- Added desktop bitmap subtitle support:
  - PGS/PGSSUB and other bitmap codecs are exposed in the subtitle picker.
  - Selecting one restarts web playback with Jellyfin video transcoding and
    server-side subtitle burn-in.
  - The selected bitmap subtitle is preserved when changing audio or quality.
  - Switching back to a text subtitle or turning subtitles off restarts without
    burn-in.
- Fixed the pre-existing `BottomNav.vue` TypeScript errors that prevented the
  strict build.
- Updated README documentation and package scripts.

## Verification

- `npm run build` passes.
- `npm test` passes: 12 files, 77 tests.
- Production dependency audit: 0 vulnerabilities with `npm audit --omit=dev`.
- Electron Node entry files pass `node --check`.
- Windows unpacked application and NSIS installer build successfully.
- Electron renderer smoke test:
  - Login screen renders.
  - Desktop bridge reports `win32`.
  - No console errors.
  - Login validation interaction works.
- Desktop media integration test:
  - Downloaded 1 MiB from a local HTTP server.
  - Progress events received.
  - Full media response returned HTTP 200.
  - Byte range returned HTTP 206 and the expected 100 bytes.
  - File stat and deletion verified.

## Generated local artifact

`release/Jellyfin V4lgrind-0.1.0-windows-x64.exe`

The release directory is ignored by Git.

## Remaining work / risks

- Run the Linux packaging workflow on GitHub Actions; Linux packages cannot be
  validated locally from Windows.
- Test streaming, automatic transcoding, downloads, subtitles, and offline
  playback against a real Jellyfin server on both operating systems.
- Add a trusted Windows code-signing certificate. Unsigned local builds may be
  blocked by Smart App Control, AppLocker, or WDAC.
- Configure automatic desktop updates after signing is in place.
- The full development audit still reports vulnerabilities in the existing
  `@capacitor/assets` toolchain; production dependencies report none.
