# Transcode dialog: "Download original" still transcoded

**Date:** 2026-07-16
**PR:** https://github.com/v4lgrind/mediaserver-client/pull/34 (branch `fix/download-original-ignored`)

## Investigated

After the transcode dialog appeared for an incompatible media, clicking
"Download original" still started a transcoded download.

## Root cause

`onTranscodeOriginal` (`src/pages/ItemDetailsPage.vue`) called
`startPendingDownloads()` with no options, making the explicit user choice
indistinguishable from the automatic path. `_getTranscodeUrlIfNeeded`
(`src/store/download-store.ts`) re-ran `checkNeedsTranscode`, which returned
`true` again (same reason the dialog opened), so it transcoded anyway.

## Changes

- `src/store/download-store.ts`: `TranscodeOptions.forceOriginal?: boolean`;
  `_getTranscodeUrlIfNeeded` returns early when set.
- `src/pages/ItemDetailsPage.vue`: `onTranscodeOriginal` passes
  `{ forceOriginal: true }` (single + bulk paths both go through
  `startPendingDownloads`).

`vue-tsc --noEmit` clean; `vitest run` 71/71 pass.

## Next steps

- PR #34 awaiting review by repo owner.
- The media that triggered the dialog was likely MKV or off-whitelist codec
  (subtitle streams are ignored by `needsDesktopTranscode`, so subtitles were
  not the cause). If direct playback of MKV H.264/AAC matters, see the
  follow-up idea in `2026-07-16-desktop-transcode-false-positive.md`.
