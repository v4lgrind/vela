# Desktop: direct-download MKV when codecs are Chromium-compatible

**Date:** 2026-07-16
**PR:** https://github.com/v4lgrind/mediaserver-client/pull/35 (branch `feat/desktop-mkv-support`)

## Investigated

Whether the desktop (Electron) build can play MKV containers directly, making
the forced transcode for MKV downloads unnecessary.

## Findings

- Chromium demuxes Matroska natively; the app already assumes this online (web
  `deviceProfile` declares `mkv` DirectPlay) and `electron/media.cjs` already
  maps `.mkv` → `video/x-matroska` with Range support.
- **Runtime-verified** with the project's Electron 43.1.1: ffmpeg-generated MKV
  (h264 + AAC) played through an exact replica of the app's `media://` protocol
  handler — video and audio both decoded. Works with any served Content-Type.
- Caveat discovered: `file://` URLs do NOT play MKV (Chromium gates on
  extension-mapped MIME before demuxing). Irrelevant for the app — desktop
  offline playback uses `media://` (`useOfflinePlayer.ts:72`).
- Codec limits: no HEVC (platform-dependent hw decode only), no ac3/eac3/dts
  (excluded from Chromium's FFmpeg build) — those keep the transcode path.

## Changes

- `src/utils/desktopCodec.ts`: MKV branch in `needsDesktopTranscode` (video
  h264/avc/vp8/vp9/av1, audio aac/mp3/opus/vorbis/flac), checked before webm
  because ffprobe reports MKV as "matroska,webm"; new `getPrimaryContainer`
  helper exporting the normalized container.
- `src/services/downloadService.ts`: `getFileExtension` uses
  `getPrimaryContainer` — fixes filenames like `Name.mov,mp4,m4a,3gp,3g2,mj2`
  from the raw ffprobe CSV.
- `src/utils/desktopCodec.test.ts`: MKV-transcode test inverted (intentional
  behavior change) + 5 new cases. 77/77 pass, `vue-tsc --noEmit` clean.

## Follow-up in the same PR: sidecar subtitles for direct desktop downloads

Chromium's `<video>` exposes no embedded subtitle tracks, so direct downloads
(MP4 or MKV) had no offline subtitles on desktop. Added in a second commit:

- `download-store.ts`: direct desktop downloads auto-pick a text subtitle
  stream (preferred language → default-flagged → first text stream).
- `downloadService.ts`: desktop sidecars fetched as WebVTT (only format
  Chromium's `<track>` renders); Android keeps SRT for ExoPlayer.
- `useOfflinePlayer.ts`: desktop offline playback exposes the `.vtt` sidecar
  through the web player's `<track>` pipeline; auto-shown per saved/global
  subtitle preference, always selectable from the menu.
- `useWebPlayer.ts`: subtitle fetch sends the auth header only to http(s)
  URLs — on `media://` it would trigger a CORS preflight the protocol
  handler rejects.
- `electron/media.cjs`: `.vtt` → `text/vtt` MIME mapping.

Runtime-verified (Electron 43.1.1): MKV via `media://` + `media://`-served VTT
sidecar as `<track>` — cues parsed and displayed during playback.

## Next steps

- PR #35 awaiting review (auto-created by repo workflow on branch push; body
  filled in via `gh pr edit`).
- Pre-existing `.srt` sidecars from old desktop transcoded downloads are still
  ignored by the desktop offline player (`.vtt` only); re-download to get
  subtitles there.
