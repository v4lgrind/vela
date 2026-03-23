# Session Progress: HEVC Main 10 FFmpeg Software Decoder

**Date:** 2026-03-23
**Topic:** HEVC Main 10 offline playback via FFmpeg software decoding

## What Was Investigated

- Episode "Intrusion" (Monarch S02E04) — HEVC Main 10 Level 4.0 (hvc1.2.4.L120.B0)
- Both hardware (`c2.mtk.hevc.decoder`) and Android software (`c2.android.hevc.decoder`) MediaCodec decoders return `NO_EXCEEDS_CAPABILITIES` — the device physically cannot decode HEVC Main 10
- Jellyfin's transcoded download (MKV stream) had limitations: single audio track, single subtitle labeled "UND", cannot seek in progress bar
- The existing `libffmpegJNI.so` (7.1MB) was audio-only — had no video JNI entry points and no swscale

## Root Causes Fixed

1. **`Context: 'Static'` in TranscodingProfile** → Jellyfin refused to transcode, returned `SupportsTranscoding=false`. Fixed by changing to `Context: 'Streaming'`.
2. **Hardware HEVC check including software decoders** → `canDecodeHevc()` had false positives. Fixed in prior session.
3. **No FFmpeg video decoding** → Raw HEVC files unplayable. Solution: rebuild native lib + add Java/C bridge.

## Changes Made This Session

### New Native Library
- **Rebuilt `libffmpegJNI.so`** (now ~16MB vs 7.1MB) with:
  - `hevc` and `h264` video decoders
  - `libswscale` (for 10-bit → 8-bit pixel format conversion)
  - All original audio decoders preserved
- **NDK 26.3.11579264** installed via sdkmanager
- **CMake 3.22.1** installed via sdkmanager
- FFmpeg 6.0 source cloned from `release/6.0` branch

### New Java Files
- **`FfmpegVideoDecoder.java`** — `SimpleDecoder` wrapper that calls native `ffmpegDecode()`, returns I420 frames in `SimpleDecoderOutputBuffer.data`
- **`FfmpegVideoRenderer.java`** — `BaseRenderer` that feeds compressed data to decoder, renders I420 frames via: I420 → NV21 → JPEG → `YuvImage` → `Canvas.drawBitmap()`

### New C JNI File
- **`android/app/src/main/jni/ffmpeg_video_jni.c`** — bridge between Java and FFmpeg
  - `ffmpegInitialize`: opens codec (hevc/h264), sets extradata (HVCC/AVCC), thread count
  - `ffmpegDecode`: `avcodec_send_packet` → `avcodec_receive_frame` → `sws_scale` → copy I420 planes
  - `ffmpegGetWidth/Height`, `ffmpegFlush`, `ffmpegRelease`

### NativePlayerActivity Integration (prior session)
- On hardware decode failure (offline file + `NO_EXCEEDS_CAPABILITIES`): sets `forceSoftwareVideo=true`, rebuilds player
- When `forceSoftwareVideo=true` AND `FfmpegLibrary.supportsFormat("video/hevc")`: prepends `FfmpegVideoRenderer` to renderer list
- Logs: `[SWVideo] FFmpeg video renderer available`

### Build Script
- **`scripts/build-ffmpeg-video.sh`** — fully automated build script for future use
  - Installs NDK/CMake via sdkmanager if missing
  - Clones jellyfin-androidx-media + FFmpeg 6.0
  - Patches build files (swscale enabled, hevc/h264 added)
  - Builds FFmpeg static libs for all 4 ABIs
  - Runs CMake to produce `libffmpegJNI.so`

## Current State

- APK built (77.2MB) and installed on device
- `libffmpegJNI.so` contains all 6 video JNI symbols: `ffmpegInitialize`, `ffmpegDecode`, `ffmpegGetWidth`, `ffmpegGetHeight`, `ffmpegFlush`, `ffmpegRelease`

## Testing Steps

1. Open app → navigate to Monarch S02E04
2. Download it (raw HEVC file, no transcoding needed for Main 10)
3. Enable offline mode
4. Play the episode → should see `[SWVideo] FFmpeg video renderer available` in logcat
5. Video should play (may be slower than hardware decode — software decoding)

## What's Left

- **Test on device** — verify HEVC Main 10 actually plays offline
- **Performance** — software decoding is CPU-intensive; 1080p HEVC Main 10 may be slow on older devices. May need to limit to arm64-v8a only or add frame-drop logic.
- **Audio** — verify all audio tracks still work (FFmpeg audio decoder still handles AC3/DTS/FLAC etc.)
- **Subtitle** — verify subtitle tracks still appear
- **Frame rendering quality** — the JPEG intermediate step adds compression artifacts. Future optimization: render directly via GLES using YUV textures instead of Canvas + JPEG.

## Known Limitations

- Software HEVC decoding is CPU-bound; 4K HEVC Main 10 may stutter
- Canvas rendering path (JPEG→Bitmap→drawBitmap) is not efficient; a proper GLES YUV renderer would be better
- Only affects offline playback of incompatible HEVC files; online streaming still goes through server-side transcode

## Build Infrastructure Notes

- FFmpeg build output: `scripts/.ffmpeg-build/jellyfin-androidx-media/ffmpeg/android-libs/{abi}/*.a`
- CMake build artifacts: `/tmp/ffmpeg-jni-build/{abi}/libffmpegJNI.so`
- The `scripts/.ffmpeg-build/` directory is gitignored (should be, ~2GB)
