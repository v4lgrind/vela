# Diagnostic: Reacher season 1 PGS subtitles missing on Android

**Date:** 2026-07-13
**Scope:** Investigation only; no player behavior was changed.

## What was investigated and found

- Queried the Jellyfin server in read-only mode for `Reacher` season 1.
- All eight episodes contain the same three embedded bitmap subtitle tracks:
  - French complete (`PGSSUB`, stream index 3)
  - English complete (`PGSSUB`, stream index 4)
  - English SDH (`PGSSUB`, stream index 5)
- Jellyfin reports these streams with `IsTextSubtitleStream: false`, no `DeliveryUrl`, and `DeliveryMethod: Encode`.
- A PlaybackInfo request using the current `nativeAndroidDeviceProfile` allows raw MKV Direct Play when no subtitle is selected.
- A PlaybackInfo request with French subtitle stream index 3 selected correctly returns an HLS transcoding URL and disables Direct Play. The server therefore supports the required PGS burn-in path.
- The Android client profile only advertises external text formats (`vtt`, `srt`, `ass`, `ssa`), not PGS.
- `parseSubtitleStreams()` drops a subtitle unless it already has a delivery URL or is a text stream supporting external delivery. Every Reacher PGS stream is consequently removed from `subtitleList`.
- Raw Direct Play deliberately sends no sidecar subtitle tracks to the native player. Media3 1.5.1 does not support PGS among its documented standalone subtitle formats, so it reports no text track group from the MKV.
- The native subtitle button is only made visible when Media3 reports a text group, sidecar text tracks were passed, or offline SRT cues exist. All three counts are zero for these episodes, so the selector remains hidden.

## Root cause

PGS is an image-based subtitle format that this Media3 player cannot render directly. The client currently models selectable online subtitles as externally deliverable text tracks only. It filters PGS out before opening the native player and has no online flow that restarts playback with `SubtitleStreamIndex` so Jellyfin can burn the selected PGS stream into a transcoded video.

## Changes made

- Added this investigation note only.
- No application or server configuration changes were made.

## Recommended implementation

1. Keep all Jellyfin subtitle streams in a separate selectable metadata list, including bitmap formats such as `pgssub`.
2. Continue passing only externally playable text tracks to Media3 as sidecars.
3. Pass bitmap subtitle labels and Jellyfin stream indexes to the native picker so the subtitle button is visible.
4. When a bitmap subtitle is selected, restart playback at the current position with `SubtitleStreamIndex` set to its Jellyfin index. Jellyfin will return the HLS transcode with subtitle burn-in.
5. When bitmap subtitles are turned off, restart without `SubtitleStreamIndex` so Direct Play can resume.
6. Preserve the existing direct Media3 selection path for embedded or sidecar text subtitles to avoid unnecessary transcoding.
7. Add unit tests for classifying text versus bitmap subtitle streams and an Android integration test for selector visibility and PGS selection.

## Verification evidence

- Reacher S01E01 without a selected subtitle: `SupportsDirectPlay: true`, no transcoding URL.
- Reacher S01E01 with `SubtitleStreamIndex: 3`: `SupportsDirectPlay: false`, `SupportsTranscoding: true`, HLS transcoding URL present.

## What's left to do

- Implement the bitmap-subtitle selection and burn-in restart flow.
- Run the web/type tests and Android build.
- Validate on the physical Android phone: selector visible, French PGS selectable, playback resumes near the same timestamp, and turning subtitles off restores playback without burn-in.
