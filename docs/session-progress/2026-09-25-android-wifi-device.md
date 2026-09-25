# Android Wi-Fi device test — 2026-09-25

## Investigation
- ADB was not installed on the Linux host; Google's platform-tools were installed under the user's local share directory without sudo.
- Wireless pairing succeeded for a Pixel 10 (Android 17) and a OnePlus Pad Go (Android 14).
- The Pixel already had versionCode 251. The first debug APK used local versionCode 1, so Android rejected the update as a downgrade. No app data was deleted.

## Changes
- `Dockerfile.android` now accepts `--build-arg ANDROID_VERSION_CODE=N` (default 1) and supplies it to the existing Gradle `GITHUB_RUN_NUMBER` version code path.
- The README documents how to build an APK above an installed version and update it without uninstalling the app.
- Native and web timeline drags now scrub relative to the current position, regardless of where the finger starts; a simple tap still seeks directly. The native track is 4dp high inside its existing 32dp touch target, and the elapsed portion is blue.
- Native subtitle sizing now changes glyph size instead of scaling the entire Media3 `SubtitleView`, which had displaced huge subtitles toward the top of the video.
- Offline downloads now enrich and persist full item metadata, then await local primary, backdrop, series, season, and cast artwork before reporting completion. Existing downloads are backfilled when the Downloads page is opened online, and detail/season views resolve local images instead of server URLs offline.

## Verification
- Final `npm run build` succeeded and all 89 tests in 14 files passed.
- Docker built versionCode 257; `adb install -r` succeeded on the Android 14 tablet while preserving app data. The exported `out/mediaserver-client.apk` passed archive integrity checks and has SHA-256 `0a50c1711520e662897956b988c284c1be2f5b917a7a5f1a4cb9569759e7e15b`.
- On physical devices, the app launched, loaded the Jellyfin home screen, searched for media and displayed item details.
- Native direct playback was exercised on a separate test film. The blue elapsed track rendered to the thumb; a drag starting far to the right of the thumb moved playback from roughly 26 to 36 minutes rather than jumping near the finger; a direct tap moved playback to 1:24:03. Huge English subtitles rendered at the bottom after the glyph-sizing fix.
- Web relative dragging was smoke-tested from 30 seconds: dragging from around 75% to 87% committed 44.67 seconds, not the absolute 104-second finger position.
- Codec coverage on the Android 14 tablet included H.264 High/AAC, HEVC Main 8/AAC, HEVC Main 10/DTS, HEVC Main 10 HDR10/AAC, AV1 Main 10/AC3, MPEG-4 ASP/AVI/AC3, Dolby Vision with HDR10/EAC3, and HEVC HDR10+/TrueHD. Every sample reached rendered playback. Unsupported 4K HEVC Main 10 fell back to server H.264 transcoding; Dolby Vision cold startup took about 10 seconds; HDR10+/TrueHD startup took about 17 seconds and briefly rebuffered. The HEVC Main 8 sample recovered automatically from one FFmpeg AAC initialization failure. Playback reporting was intercepted during these probes, so the test films' watch history was not updated.
- Two compact episodes (32 MB and 51 MB) completed as original-quality offline downloads. Their persisted records contained overview and People metadata; local files covered episode, series, season, backdrop, and cast artwork.
- With airplane mode enabled, Wi-Fi retained only for ADB and application offline mode forced, the Downloads, Series, Season, and Episode surfaces rendered local `_capacitor_file_` images. The season episode thumbnail, full overview, backdrop, and cast rail were visually present; the cast-rich sample showed local 400 px portraits and no Jellyfin image URLs.
- Offline native playback opened a local `content://media/...` URI as DirectPlay, reached `READY`, and advanced from 0 to 9.775 seconds.
- Both test downloads, cached test artwork, and local test progress were removed. Jellyfin still reported both episodes unplayed at position 0; playback was stopped, forced offline mode was disabled, airplane mode was disabled, and the tablet was left on its launcher.
