# Desktop download: false "transcode recommended" for compatible MP4s

**Date:** 2026-07-16
**PR:** https://github.com/v4lgrind/mediaserver-client/pull/33 (branch `fix/desktop-container-csv-detection`)

## Investigated

Downloading 1080p H.264/AAC MP4 episodes (One Piece Kai) on the Windows desktop build
triggered the "incompatible, transcode recommended" dialog even though the files are
fully compatible.

## Root cause

`needsDesktopTranscode` (`src/utils/desktopCodec.ts`) read the **item-level**
`Container` field with strict equality (`container === 'mp4'`). Jellyfin's item-level
`Container` can be the raw ffprobe format list — confirmed against a real server
response:

```json
"Container": "mov,mp4,m4a,3gp,3g2,mj2",
"MediaSources": [{ "Container": "mp4" }]
```

The equality check never matched, fell through to the default `return true`, so every
MP4 was flagged for transcoding regardless of codecs.

## Changes

- `src/utils/desktopCodec.ts`: prefer `MediaSources[0].Container` (normalized) with
  fallback to item-level `Container`; parse the value as CSV and match tokens against
  the supported container sets (video + audio paths). MKV behavior unchanged (still
  prompts transcode — deliberate, per existing test).
- `src/utils/desktopCodec.test.ts`: two new tests (raw ffprobe CSV container; preference
  for normalized MediaSources container). 7/7 pass; `vue-tsc --noEmit` clean.

## Next steps

- PR #33 awaiting review by repo owner.
- Possible follow-up (not in this PR): accept MKV with H.264/AAC on desktop — Electron's
  Chromium demuxes Matroska natively, so a remux/direct download could replace the full
  transcode there too.
