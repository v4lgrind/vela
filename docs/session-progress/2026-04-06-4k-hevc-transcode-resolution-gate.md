# 2026-04-06 — 4K HEVC transcode dialog resolution gate

## Changes made

### 1. FFmpeg 4K crash fix (`ffmpeg_video_jni.c`)
- Added `MAX_SW_HEIGHT = 1080` constant for software decode resolution limit
- `ensure_sws()` now downscales 4K frames to max 1080p before RGBA conversion
- Prevents `av_frame_get_buffer()` failure on ~33MB 4K RGBA allocations

### 2. Frame rendering rewrite (`FfmpegVideoRenderer.java`)
- Rewrote render loop to never drop the last available frame
- Tracks `lastRenderable` and always renders most recent past-due frame
- Removed aggressive `MAX_LATE_US` threshold that caused black screens

### 3. Transcode download dialog (`TranscodeDownloadDialog.vue`)
- New Reka UI Dialog with audio/subtitle track radio button pickers
- Pre-selects default tracks on open
- Emits `confirm` (with track indices) or `original` (raw download)

### 4. Download store enhancements (`download-store.ts`)
- Added public `checkNeedsTranscode(metadata)` method using `hardwareOnly: true`
- Added `TranscodeOptions` interface and `_transcodeOptionsQueue` state
- `startDownload()` accepts optional `TranscodeOptions` for forced transcoding
- `_getTranscodeUrlIfNeeded()` passes `AudioStreamIndex`/`SubtitleStreamIndex` to Jellyfin PlaybackInfo API
- Fixed download retry after cancel: explicitly deletes cancelled/failed tasks

### 5. Per-episode download button (`ItemDetailsPage.vue`)
- Added download button in season episode list (after downloaded/downloading indicators)
- `handleEpisodeDownload(ep)` fetches full metadata then checks transcode need

### 6. Resolution gate for transcode dialog (`download-store.ts`)
- `checkNeedsTranscode()` now only returns `true` for video height > 1080
- 1080p HEVC Main 10 (unsupported by hardware) silently falls back to FFmpeg software decoder
- 4K content still triggers the transcode dialog

### 7. NativeVideo plugin (`NativeVideoPlugin.kt`)
- Added `hardwareOnly` boolean parameter to `canDecodeHevc()`
- When `true`, skips FFmpeg fallback check (used at download time vs playback time)

## Key decisions
- FFmpeg software decode works fine at 1080p, even for Main 10 profile
- 4K software decode is too slow (choppy), so server-side transcoding is offered
- Resolution threshold of 1080p matches the native `MAX_SW_HEIGHT` constant
