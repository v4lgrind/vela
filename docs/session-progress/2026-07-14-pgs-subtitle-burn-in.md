# Android PGS subtitle selector and burn-in playback

**Date:** 2026-07-14
**Branch:** `codex/fix-pgs-subtitles`

## What was investigated and found

- The previous diagnostic confirmed that Reacher season 1 contains bitmap `PGSSUB` streams only.
- Media3 cannot render those streams directly, but Jellyfin returns a valid HLS transcode when the selected PGS stream index is sent in `PlaybackInfo`.
- The existing client discarded non-text subtitle metadata before opening the native player, leaving the native subtitle button hidden.

## Changes made

- Added a subtitle classification utility that keeps both externally playable text subtitles and bitmap subtitles requiring server burn-in.
- Added PGS/PGSSUB `Encode` capabilities to the playback device profiles.
- Extended the Capacitor native-player contract with:
  - the list of burn-in subtitle stream indexes and labels;
  - the currently selected burn-in stream index;
  - a typed selection event for switching into or out of burn-in playback.
- Updated the Android native player to:
  - show the subtitle button when bitmap tracks exist;
  - combine Media3 text tracks and Jellyfin bitmap tracks in the same picker;
  - indicate the active PGS track;
  - notify Vue when a PGS track or Off is selected.
- Updated online Android playback to restart at the current position with `SubtitleStreamIndex` for PGS selection.
- Turning PGS subtitles off restarts without `SubtitleStreamIndex`, allowing Direct Play again.
- Persisted PGS choices as `burn-in:<streamIndex>` and restore them on the next playback.
- Preserved active audio/video fallback flags and chapter metadata across subtitle-triggered restarts.
- Kept the web preview behavior unchanged: bitmap tracks remain hidden there because the HTML video path cannot render them.

## Verification

- `npm test`: 11 test files passed, 60 tests passed.
- `npm run build:skip-types`: passed.
- `npx vue-tsc --noEmit`: reaches two pre-existing errors in `src/components/BottomNav.vue`; no new errors from the PGS changes were reported.
- `git diff --check`: passed.
- Android Kotlin compilation could not run because no Android SDK or `ANDROID_HOME` is available on this machine. Gradle itself initialized successfully after Capacitor sync, then stopped at SDK discovery.

## What's left to do

- On a machine with the Android SDK, run `npm run android:build`.
- Install the debug APK on the phone and verify Reacher S01:
  - subtitle button is visible;
  - French PGS selection resumes playback near the same position;
  - the selected row remains highlighted;
  - Off resumes without burn-in and returns to Direct Play;
  - audio/quality switching keeps the active subtitle choice.
