# FFmpeg Decoder + Offline Track Selection + Codec Detection

**Date**: 2026-03-21
**Branch**: `feat/ffmpeg-decoder-offline-track-selection`

## Problem

- Downloaded media with EAC3+Dolby Atmos audio (e.g., F1 Drive to Survive S08E03) fails to play offline on devices without hardware EAC3/Atmos decoder support
- `initOfflinePlayer()` lacked `tracksReady`, `audioError`, `audioSelected`, `subtitleSelected` event listeners — no track selection UI and no error recovery in offline mode
- Online mode used a reactive crash-restart cycle when audio codecs were unsupported

## Changes Made

### Part 1: FFmpeg Audio Decoder Extension
- Built FFmpeg 6.0 with comprehensive audio codec support: AC3, EAC3, DTS, TrueHD, MLP, AAC, MP3, FLAC, Vorbis, Opus, ALAC, PCM variants
- Built `libffmpegJNI.so` for all 4 ABIs (arm64-v8a, armeabi-v7a, x86, x86_64)
- Placed in `android/app/src/main/jniLibs/`
- Copied Media3 FFmpeg decoder Java sources into `android/app/src/main/java/androidx/media3/decoder/ffmpeg/`
- Configured ExoPlayer to use `DefaultRenderersFactory` with `EXTENSION_RENDERER_MODE_ON` (FFmpeg as fallback when platform decoder unavailable)

### Part 2: Offline Track Selection Listeners
- Added `tracksReady` listener: populates audio/subtitle picker UI from ExoPlayer embedded tracks, applies saved preferences
- Added `audioSelected` listener: persists language choice to localStorage
- Added `subtitleSelected` listener: persists subtitle choice to localStorage
- Added `audioError` listener: safety net that restarts playback skipping the failed track
- Added `debugLog` listener for consistency
- Added `lastGoodPositionSec` tracking for accurate resume on error recovery

### Part 3: Proactive Codec Detection (Online)
- Added `getDeviceCodecs()` method to NativeVideoPlugin (Kotlin) — queries `MediaCodecList` for supported audio decoders
- Exposed via TypeScript interface in `NativeVideoPlugin.ts`
- Added web stub in `NativeVideoPluginWeb.ts`
- Before online playback, checks if preferred audio codec is natively supported
- If unsupported, proactively requests server-side transcoding instead of the crash-restart cycle

## Files Modified

- `android/app/build.gradle` — comment about FFmpeg sources
- `android/app/src/main/jniLibs/` — pre-built FFmpeg .so files (new)
- `android/app/src/main/java/androidx/media3/decoder/ffmpeg/` — FFmpeg decoder Java sources (new)
- `android/app/src/main/java/.../NativePlayerActivity.kt` — DefaultRenderersFactory with extension mode
- `android/app/src/main/java/.../NativeVideoPlugin.kt` — getDeviceCodecs() method
- `src/plugins/NativeVideoPlugin.ts` — getDeviceCodecs() interface + selectedAudioIndex
- `src/plugins/NativeVideoPluginWeb.ts` — getDeviceCodecs() stub
- `src/pages/PlayerPage.vue` — offline track listeners + codec detection + CODEC_MIME_MAP

## Verification

- `npm run build:skip-types` — passes
- `./gradlew assembleDebug` — BUILD SUCCESSFUL
- APK includes libffmpegJNI.so for all 4 ABIs
- APK size: 35MB (debug)

## Next Steps

- Test on device with media that has EAC3+Atmos audio tracks
- Verify offline track switching works
- Verify proactive codec detection triggers server transcoding when appropriate
- Consider filtering ABIs for release builds (most devices only need arm64-v8a)
