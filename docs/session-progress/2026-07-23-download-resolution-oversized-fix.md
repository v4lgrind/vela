# 2026-07-23 — Fix: downscaled downloads were larger than the source

## Symptom

After merging the download resolution picker (#38), picking a lower resolution
(e.g. 720p for a 4K film) produced a file *larger* than the untranscoded original.
Example: Sicario estimated at ~6 GB in 720p downloaded as ~14 GB — bigger than the
original HEVC file.

## Root cause

`_getTranscodeUrlIfNeeded()` relied solely on `MaxStreamingBitrate` in the
PlaybackInfo device profile to cap the bitrate/resolution. Jellyfin does **not**
reliably honour that for downloaded (progressive) transcodes — it re-encoded at the
source 4K resolution to H.264 (much less efficient than the source HEVC), so the
output ballooned past the original. The offline page reported the real on-disk size,
so the number was accurate — the transcode itself was wrong.

## Fix

`src/store/download-store.ts`

- Added `withForcedVideoParams(url, videoBitrate, height)`: forces
  `videoBitRate` + `maxWidth`/`maxHeight` directly on the transcode stream URL, which
  Jellyfin honours unconditionally. Existing values are stripped case-insensitively
  first so ASP.NET never receives duplicate query keys.
- When a bitrate cap is set, the returned `TranscodingUrl` is rewritten with the
  preset's target box (height from `QUALITY_PRESETS`, width = round(h × 16/9)) and the
  exact `videoBitRate`, and the size estimate is recomputed from that bitrate so the
  dialog estimate and the actual download line up.

`src/store/download-store.test.ts` — new unit tests for `withForcedVideoParams`
(adds params, replaces baked-in case-variant params, height=0 bitrate-only cap,
unparseable URL passthrough).

## Validation

- `vue-tsc --noEmit` — clean.
- `vitest run` — 81/81 pass (77 existing + 4 new).

## Notes

- The `MaxStreamingBitrate` injection in the PlaybackInfo request is kept as well
  (harmless; helps negotiation), but the URL params are what actually guarantee the
  resolution now.
- Audio is still stream-copied on Android (unchanged); a lossless track can add a
  little size but nowhere near the previous 2× blow-up. Could be capped later if
  needed.
