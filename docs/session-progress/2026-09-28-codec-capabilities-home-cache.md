# Device codec capabilities and home cache — 2026-09-28

## Investigation
- The previous native profile advertised fixed codec support. A device could therefore receive a stream whose profile, level, dimensions, frame rate, or audio decoder exceeded its real MediaCodec capabilities and only recover after a visible playback failure.
- The Android 14 OnePlus Pad Go reports hardware H.264/HEVC/VP8/VP9 decoders, software AV1, platform AAC/AC3/E-AC3/E-AC3-JOC, and the packaged FFmpeg audio/video decoders. Its 4K HEVC Main 10 probe is rejected for profile/level, AV1 is rejected because there is no hardware decoder, and 1080p H.264 High is accepted by `c2.mtk.avc.decoder`.
- `MediaList.vue` fetched libraries, resume items, next-up items, and recent additions every time the home route was mounted, including normal navigation back from another page.

## Changes
- `NativeVideoPlugin` now exposes device codec/display metadata and a MediaCodec profile/level/size/rate probe. The Capacitor TypeScript contract and web stub expose the same API.
- Central codec detection maps Jellyfin codec/range metadata to Android MIME types, distinguishes hardware, software, platform-audio, and packaged FFmpeg support, and derives an automatic transcode bitrate from the physical display class.
- Native online playback probes the selected video and audio streams before requesting playback info. Unsupported video requests an H.264 server transcode; unsupported audio requests AAC while retaining video stream copy when possible. Forced automatic video transcodes use a bounded bitrate instead of the previous 1 Gbit/s ceiling.
- Android keeps MediaCodec as the preferred renderer and enables packaged FFmpeg extensions as fallback. AAC must use MediaCodec; E-AC3 Atmos/JOC requires explicit platform JOC support.
- Offline download compatibility uses the same runtime capability data and only keeps a software-decoded original video at 1080p or below.
- The home page keeps a per-server/user in-memory snapshot across route changes. A refresh button in the header explicitly refetches all four home data groups while preserving the rendered snapshot during the request.
- Logging and README documentation describe the selected capability/fallback path and the new home refresh behavior.

## Verification
- `npm run build` succeeded after the capability work and again with the home cache UI.
- All 89 Vitest tests in 14 files passed, including codec mapping, AAC/JOC decisions, FFmpeg fallback, and display-class bitrate tests.
- On the physical Android 14 tablet, the native plugin returned the device codec matrix and display size. Direct probes returned `unsupported_profile_or_level` for 3840×1636 HEVC Main 10 level 150, `no_hardware_decoder` for 1080p AV1 Main 10, and `supported` with `c2.mtk.avc.decoder` for 1080p H.264 High.
- The browser home scenario made four API requests on first load, zero when navigating Settings → Home, and four after pressing refresh. Cached resume/recent content remained rendered on return.
- Docker produced versionCode 259 at `out/mediaserver-client.apk`; the Android build completed successfully, the APK archive passed `unzip -t`, and its SHA-256 is `b417a18751b94d321973f49bd05df57285228910141879d023c0cccf4d6aa0b0`.
- `adb install -r` installed versionCode 259 on the OnePlus Pad Go without clearing app data. The real home UI rendered the refresh control and retained its content with no home API requests after navigating Settings → Home; pressing refresh requested views, resume, next-up, and all recent-library feeds.
- End-to-end playback of the 3840×1636 HEVC Main 10 sample rejected direct play before startup, requested an H.264/AAC transcode at about 20 Mbit/s, reached Media3 `READY`, and advanced normally. Stopping the short probe left the item's Jellyfin `UserData` empty.
