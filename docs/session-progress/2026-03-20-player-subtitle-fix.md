# Session: Player subtitle + double-load fix after audio change

**Date**: 2026-03-20
**Branch**: `fix/player-resume-subtitles-audio-picker`

## Bug Reports

### Bug 1: Subtitles don't work after audio change
Starting playback, changing the audio track, then trying to enable subtitles — no subtitles displayed.

### Bug 2: Double-load on audio switch requiring transcode
When switching to an audio track that requires transcoding, the stream loads twice — shows one frame then rebuffers.

**Test media**: MKV with HEVC video, 2 audio tracks (French EAC3, English EAC3+Atmos), 3 SRT subtitles. Item ID: `b92b7e7d7a6f330a1b21704789c3d466`.

## Root Causes

### Subtitles (two layers)

**Layer 1**: `HlsMediaSource.Factory` and `ProgressiveMediaSource.Factory` both ignore `SubtitleConfigurations` on the `MediaItem`. Only `DefaultMediaSourceFactory` processes them.

**Layer 2**: Media3 1.5.x's new subtitle pipeline rejects raw `text/vtt` samples:
```
Legacy decoding is disabled, can't handle text/vtt samples (expected application/x-media3-cues)
```
`DefaultMediaSourceFactory` wraps subtitle sources with `SubtitleParser` to produce the expected `x-media3-cues` format.

### Double-load

For HLS transcode, Jellyfin's `TranscodingUrl` already includes `StartTimeTicks` — the stream begins at the resume position. But `startPositionMs` (the absolute movie position) was also passed to ExoPlayer's `setMediaItem(item, startMs)`, causing a redundant seek within the stream: ExoPlayer loads the first segment, shows a frame, then seeks ahead and rebuffers.

## Fixes Applied

### Fix 1: DefaultMediaSourceFactory (`NativePlayerActivity.kt`)
- Replaced raw `HlsMediaSource.Factory` / `ProgressiveMediaSource.Factory` with `DefaultMediaSourceFactory(dataFactory)`
- `DefaultMediaSourceFactory` auto-detects HLS vs Progressive, processes SubtitleConfigurations with the new parsing pipeline, and merges via MergingMediaSource
- Uses the auth-enabled `dataFactory` for all sources (including VTT fetches)
- `@Suppress("DEPRECATION")` on the `DataSource.Factory` constructor (Context constructor doesn't accept custom data source factory)

### Fix 2: startPositionMs / resumeOffsetMs (`PlayerPage.vue`)
- **DirectPlay**: `startPositionMs = resumeSeconds * 1000` (ExoPlayer needs explicit seek in raw file), `resumeOffsetMs = 0` (position is absolute)
- **HLS transcode**: `startPositionMs = 0` (stream already starts at resume point), `resumeOffsetMs = resumeSeconds * 1000` (convert stream-relative to absolute for Jellyfin reporting)
- This restores the main-branch `resumeOffsetMs` logic that was incorrectly changed to always be 0

### Diagnostic logs added
- `NativePlayerActivity`: logs every `onPlaybackStateChanged` with state name, position, duration
- `PlayerPage.vue`: logs `startPositionMs`, `resumeOffsetMs`, `isDirectPlayRaw`, `playMethod` before starting native player
- `PlayerPage.vue`: step-by-step logs in `restartWithAudio` flow

## Status

- [x] Root cause: subtitles (SubtitleConfigs ignored + Media3 1.5 VTT rejection)
- [x] Root cause: double-load (redundant seek on HLS transcode)
- [x] Fix: DefaultMediaSourceFactory
- [x] Fix: conditional startPositionMs + resumeOffsetMs
- [x] Diagnostic logs added
- [ ] Build verification (blocked by JDK version mismatch — Java 25 vs Gradle)
- [ ] Test: start playback → change audio → enable subtitles
- [ ] Test: DirectPlay subtitle selection (embedded SRT)
- [ ] Test: HLS transcode resume position and progress reporting
- [ ] Test: skip intro with HLS offset
- [ ] Test: quality switch with HLS offset

## Notes

- Media3 version: 1.5.1
- `nativeResumeOffsetMs` is used by skip-intro seek and quality-switch stop position — both already subtract/add the offset correctly
- For DirectPlay MKV, `subtitleTracks = []` (no sidecar) — embedded subtitles come from the container
- `DefaultMediaSourceFactory` discovers `HlsMediaSource.Factory` via service loader (`media3-exoplayer-hls` dependency)
