# Jellyfin 12 client compatibility — 2026-09-25

## Investigation
- The live Jellyfin server reports 12.1.0. Legacy token headers are rejected (HTTP 401); `ApiKey` succeeds where media elements cannot attach headers. Audio universal URLs with `api_key` return 401, and downloads with `X-Emby-Token` return 401.
- The project locked SDK 0.11.0, generated against Jellyfin 10.10. Native ExoPlayer video already sent a supported MediaBrowser Authorization header.

## Changes
- Migrated `@jellyfin/sdk` to 1.0.0 and updated store API factories and login calls. The SDK `Api` is marked raw in Pinia so its class identity/private fields survive Vue state access.
- Web audio and DirectPlay URLs use `ApiKey` where headers cannot be attached. HLS.js, external subtitles, downloads, transcode negotiation, playback reporting and offline progress sync use `Authorization: MediaBrowser`. Native Safari HLS receives an `ApiKey` URL; header-authenticated streams drop server-supplied URL tokens.
- Updated URL regressions and README compatibility guidance; removed a mock-forwarding-only test. Removed the obsolete `api_key` assertion from download URL tests.

## Verification and limits
- `npm run build` succeeded after the Pinia raw-API fix; `npm test` passed (87 tests in 13 files after removing the redundant forwarding-only test).
- Browser preview on Jellyfin 12.1: login, home, Films list and Unwatched filter loaded; Music album playback returned HTTP 206 with session reports HTTP 204 and progressed; HLS 360p manifest and segments returned HTTP 200 and video progressed; external VTT subtitles returned HTTP 200. Stopping the video sent `Sessions/Playing/Stopped` and deleted active encoding (both HTTP 204). Token-only MediaBrowser download with byte range returned HTTP 206 and PlaybackInfo returned HTTP 200.
- Docker `assembleDebug` succeeded and exported `out/mediaserver-client.apk` (SHA-256 `91fc9a82439a8ae94f149dbd9883d9bf240241d16cb5eab9da211704b1ef38c7`); `unzip -tq` found no archive errors.
- No full offline download or offline-progress mutation was performed against the live account. Native Android playback and native downloads were not exercised on a device. The test account may have a short audio/video watch position from these checks.
