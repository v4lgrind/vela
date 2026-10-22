# 2026-10-22 — English Atmos track plays silent on Pixel 10

## Symptom
Hellraiser (`530b0b8b6f68bdf63162b091a6ccf6a9`): the English track
(E-AC3 + Dolby Atmos 5.1) played with no sound on the Pixel 10.

## Root cause
- The app correctly flags E-AC3 JOC as undecodable on the Pixel 10 and asks
  for an audio transcode (`AllowAudioStreamCopy: false`, no DirectPlay).
- But the video transcoding profiles list `AudioCodec: "aac,eac3,ac3"`, so
  Jellyfin kept the source codec as target (`AudioCodec=eac3` in the URL).
- Jellyfin then served **MP3 stereo** segments under a master playlist with
  `CODECS="avc1.640028"` (no audio codec). ExoPlayer trusts CODECS and
  exposed **0 audio tracks** (`reportTracks: 0 audio`).
- Same request with `AudioCodec=aac` → `CODECS="avc1.640028,mp4a.40.2"`,
  AAC 5.1 segments.

## Changes
- `src/utils/codecDetection.ts`: `withAacTranscodeAudio()` makes AAC the only
  audio target of video transcoding profiles.
- `src/composables/player/usePlayerSession.ts`: applied in
  `fetchPlaybackInfo` when `transcodeAudio` is set.
- Test in `src/utils/codecDetection.test.ts`.

## Verified
- 163/163 unit tests, type check clean.
- APK versionCode 11 installed on the Pixel 10: URL now `AudioCodec=aac`,
  `reportTracks: 1 audio codec=mp4a.40.2`, `c2.android.aac.decoder`,
  AudioTrack started 5.1.

## Not yet done
- Not committed.
- Not tested: switching FR → EN from the in-player audio picker (goes through
  the same `fetchPlaybackInfo(transcodeAudio)` path, so should be covered).
- User mentioned other glitches seen on the Pixel; only this one handled.

---

# Same session — MobLand image framed inside the screen

## Finding
- MobLand S01E01 (`7751732791d6012a73e5c1becd06106a`) is 1920×1080 with the
  picture letterboxed **inside the file** (cropdetect: 1920×804, 138 px black
  top/bottom). On the Pixel's 2424×1080 screen the player fits 16:9 with side
  bars → black frame on all four sides. Rendering is correct; the player had
  no zoom mode at all.

## Change
- `NativePlayerActivity.kt`: pinch-to-zoom via `ScaleGestureDetector` in
  `dispatchTouchEvent`. Pinch out (>1.1×) → `RESIZE_MODE_ZOOM`, pinch in
  (<0.9×) → `RESIZE_MODE_FIT`. Ignored while long-press scrubbing.
- APK versionCode 12 installed on the Pixel; pinch not testable via adb →
  needs a manual check on the phone.

## Next
- User to confirm pinch works; then commit both fixes.
