# 2026-11-27 — Music: event backlog after background playback

## Problem

After listening with the app in the background, coming back showed the UI
"fast-forwarding" through the past tracks, sometimes on a black screen.

Cause (measured on the phone): `NativeAudioPlugin` sent a `stateChange` event
every second while playing, visible or not. A hidden WebView is throttled then
frozen, so those ticks piled up and were all replayed on return (2 min test:
21 s of events held back, then 30 processed in < 50 ms; ~3600 per hour).

## Fix

`android/.../NativeAudioPlugin.kt`
- `handleOnStop` / `handleOnStart`: the 1 s position ticker only runs while the
  app is on screen; on return one fresh state is sent and ticks restart.
- While hidden, player events that change nothing for JS (buffering, loading
  the next track) are skipped: an event goes out only when index, track,
  play/pause or ended changes.
- `onPositionDiscontinuity` records the track left and its position; every
  state carries `previousTrackId` / `previousPositionMs`.

JS
- `NativeAudioState` / `EngineState` gain the previous-track fields.
- `src/services/audio/position.ts` `positionLeftAt()`: on a track change, the
  "stopped" report uses the engine's recorded end position instead of the last
  (possibly minutes old) tick. Wired in `audioPlayerService.onEngineState`.
- Tests: `src/services/audio/position.test.ts` (4 tests). Full suite 482/482,
  `vue-tsc` clean.

## Verified on the emulator (vela_phone, local Jellyfin 10.11.3)

100 s in the background over 2 track changes:
- before the filter: 12 events while hidden (bursts at the 30 s mark);
- final build: 4 events while hidden (one per track change, each with the
  previous track's end position = 40 s), then a fresh state on return and
  ticks resume.
- Jellyfin recorded every play with the right times.

Emulator setup notes: the WebView is `https://localhost`, so `http://10.0.2.2`
is blocked as mixed content — run `adb reverse tcp:8096 tcp:8096` and sign in
to `http://localhost:8096`. Local builds need `ANDROID_VERSION_CODE` above the
installed one (used 1050207) and the re-sign script.

## Not done / next

- Installed on the Pixel 10 as 1.5.2-bgfix (versionCode 1050207). The user's
  first impression on 2026-11-28: looks good. Keep an eye out after longer
  sessions (1 h+ in the background).
