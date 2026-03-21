# HEVC Codec Fallback + Transcoded Downloads with All Tracks

**Date**: 2026-03-21
**Branch**: `main`

## Problems Addressed

1. **HEVC Main 10 Level 5.1 playback crash** — OnePlus OP5DA6L1 device threw `NO_EXCEEDS_CAPABILITIES` error on HEVC Main 10 content. Player reloaded multiple times visibly before falling back to transcoded stream.
2. **Dolby Vision offline playback failure** — Downloaded DV files showed "unsupported" error when offline.
3. **Downloaded files missing audio tracks + subtitles** — Transcoded downloads only had the default audio track (AAC) and no subtitles.
4. **Transcoded download progress at 0%** — Chunked transfer encoding (no `Content-Length`) made progress tracking impossible, showing 0% the whole time.
5. **Offline episode tap goes back to season** — Tapping an episode in the offline library navigated back to the season list instead of opening the detail page.

---

## Changes Made

### `NativePlayerActivity.kt`
- Added `videoCapFallbackMode` guard variable (prevents infinite restart loops)
- Added `isVideoCapabilityExceededError()` — detects `NO_EXCEEDS_CAPABILITIES` in the ExoPlayer error chain, fingerprinted by `VideoRenderer`/`MediaCodecVideoRenderer`
- In `onPlayerError`: fires a `videoError` broadcast with `reason="video_codec_unsupported"` when capability error detected, then finishes the Activity
- Dolby Vision offline: when DV is unsupported (`dvFallbackMode`), rebuilds the media source using a `DefaultMediaSourceFactory` with a `MediaCodecSelector` that remaps `video/dolby-vision` → `video/hevc`, allowing the HEVC base layer to play

### `NativeVideoPlugin.kt`
- Added `canDecodeHevc` plugin method — maps Jellyfin profile strings (e.g. `"Main 10"`) and level integers (e.g. `153`) to Android `CodecProfileLevel` constants using `MediaCodecList.ALL_CODECS`
- Level map covers L1.0 through L6.2 for both Main and High tier
- Used by the JS layer to proactively detect whether a given HEVC stream can be hardware-decoded before attempting playback or download

### `src/plugins/NativeVideoPlugin.ts`
- Added `canDecodeHevc(options: { profile: string; level: number }): Promise<{ supported: boolean }>` to the plugin interface

### `src/plugins/NativeVideoPluginWeb.ts`
- Added web stub: `canDecodeHevc` always returns `{ supported: true }`

### `src/pages/PlayerPage.vue`

**Loading state fix (invisible fallback)**
- Removed `isLoading.value = false` from after `NativeVideo.start()` in both `initNativePlayer` and `initOfflinePlayer`
- Moved spinner dismissal to the `tracksReady` event listener — the spinner stays up until ExoPlayer has actually loaded the stream, making retranscode restarts invisible to the user

**Proactive HEVC profile/level detection (online)**
- In the pre-playback codec detection block: after the MIME type check passes for HEVC, calls `NativeVideo.canDecodeHevc({ profile, level })` to verify the specific profile and level are supported
- If unsupported, sets `forceTranscodeVideo = true` before playback starts — no crash-restart cycle

**Codec fallback handler (online + offline)**
- `videoError` listener extended to handle `video_codec_unsupported` the same as `dolby_vision_unsupported`: restarts playback with `forceTranscodeVideo=true`
- Offline `videoError` handler: for both `dolby_vision_unsupported` and `video_codec_unsupported`, falls back to online transcoding via `initNativePlayer` with `forceTranscodeVideo=true`

### `src/store/download-store.ts`

**HEVC profile/level check at download time**
- In `_getTranscodeUrlIfNeeded`: after MIME type check passes for HEVC, calls `NativeVideo.canDecodeHevc` to verify profile/level
- If unsupported, sets `needsTranscode = true` — downloads the transcoded MKV instead of the raw file

**Multi-track transcode profile**
- Container changed from `mp4` → `mkv` (supports multiple audio tracks + embedded subtitles)
- `AllowAudioStreamCopy: true` — preserves original audio quality where possible
- Broad `AudioCodec` list: `aac,mp3,ac3,eac3,dts,flac,opus,pcm` — Jellyfin copies compatible tracks, transcodes others to AAC
- `SubtitleProfiles` added: `srt`, `subrip`, `ass`, `ssa`, `pgs`, `pgssub` all with `Method: "Embed"` — subtitles embedded directly in the MKV
- `AllowVideoStreamCopy: false` — always re-encodes video to H.264 for device compatibility

**Estimated file size for progress tracking**
- `_getTranscodeUrlIfNeeded` return type changed from `string | undefined` to `{ url: string; estimatedSize: number } | undefined`
- `estimatedSize` is calculated as `Math.ceil((ms.Bitrate / 8) * (ms.RunTimeTicks / 10_000_000))` from the PlaybackInfo response
- `_executeDownload` destructures the result and passes `estimatedSize` to `downloadService.downloadForOffline`

### `src/services/downloadService.ts`
- Extension for transcoded files changed from `'mp4'` → `'mkv'`
- `downloadForOffline` accepts new optional `estimatedSize?: number` parameter
- Progress listener: uses `estimatedSize` as `total` when `event.contentLength` is 0 (chunked transfer)
- Polling fallback: uses `estimatedSize` to compute percentage from file size on disk

### `src/pages/OfflineLibraryPage.vue`
- `onBeforeRouteLeave` guard now checks the destination route before intercepting
- Navigation to `ItemDetails` or `Player` is allowed through uninterrupted
- Back-button / Android hardware back still pops through `episodes → seasons → root` as before
- **This fixes: tapping a downloaded episode going back to season instead of opening detail page**

---

## Behavior Matrix (all scenarios)

| Scenario | Codec supported? | What happens |
|---|---|---|
| **Play online**, codec supported | ✅ | Direct play — raw file streamed |
| **Play online**, codec unsupported (HEVC Main 10, DV) | ❌ | Proactive check → `forceTranscodeVideo=true` → Jellyfin streams H.264 |
| **Play online**, codec slips through proactive check | ❌ | Reactive `isVideoCapabilityExceededError` → `videoError` → restart with transcode |
| **Download**, codec supported | ✅ | Raw file downloaded unchanged |
| **Download**, HEVC MIME unsupported | ❌ | MIME check fails → download transcoded MKV (H.264, all audio, embedded subs) |
| **Download**, HEVC Main 10 / Level 5.1 (MIME passes, profile/level fails) | ❌ | `canDecodeHevc` fails → download transcoded MKV |
| **Download**, Dolby Vision | ❌ | DV MIME check fails → download transcoded MKV |
| **Play offline**, raw file, codec supported | ✅ | Direct playback of `file://` URI |
| **Play offline**, raw file, DV (device has HEVC) | ❌ | ExoPlayer DV error → DV→HEVC base layer rebuild in-place |
| **Play offline**, raw file, codec unsupported | ❌ | `videoError` → fall back to online transcoding (requires internet) |
| **Play offline**, transcoded MKV | ✅ | Direct playback — already H.264 at download time |

---

## Files Modified Summary

- `android/app/src/main/java/com/jellyfin_v4lgrind_client/app/NativePlayerActivity.kt`
- `android/app/src/main/java/com/jellyfin_v4lgrind_client/app/NativeVideoPlugin.kt`
- `src/plugins/NativeVideoPlugin.ts`
- `src/plugins/NativeVideoPluginWeb.ts`
- `src/pages/PlayerPage.vue`
- `src/store/download-store.ts`
- `src/services/downloadService.ts`
- `src/pages/OfflineLibraryPage.vue`

---

## Next Steps

- Build and test: `npm run android:build`
- Download *The Batman* (HEVC Main 10 Level 5.1, EAC3, multiple subtitle tracks)
  - Expect: `canDecodeHevc` fails → transcoded MKV downloaded with progress bar working
  - Expect: downloaded MKV plays offline with all audio tracks and subtitles available
- Test DV offline playback (in-place HEVC base layer rebuild)
- Test episode tap in offline library → should open ItemDetails, not go back to season
- Verify online HEVC Main 10 playback shows loading spinner until stream is ready (no flash of UI)
