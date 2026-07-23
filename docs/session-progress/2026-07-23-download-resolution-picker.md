# 2026-07-23 — Download resolution picker

## Goal

Let the user pick a target resolution when downloading any video, not only when
the codec is incompatible. Typical use: grab a 720p copy of a 4K film to save
disk space and bandwidth.

## What was there before

- `TranscodeDownloadDialog.vue` only opened when `checkNeedsTranscode()` said the
  media was incompatible; compatible media downloaded directly.
- A quality-preset system (Auto / 4K / 1080p / 720p / 480p / 360p → bitrates)
  existed **only for streaming playback** in `usePlayerSession.ts`.
- Jellyfin downscale mechanism already proven on the streaming side:
  `MaxStreamingBitrate` + `DirectPlayProfiles: []` + `AllowVideoStreamCopy: false`.

## Changes

- **`src/constants.ts`** — added shared `QUALITY_PRESETS` (lifted from the player).
- **`src/composables/player/usePlayerSession.ts`** — now imports `QUALITY_PRESETS`
  instead of its local copy (removed the now-unused `QualityPreset` type import).
- **`src/store/download-store.ts`**
  - `TranscodeOptions` gained `maxBitrate?: number` (bps; 0 = Auto/original).
  - `_getTranscodeUrlIfNeeded()` now transcodes whenever a bitrate cap is set —
    even for a device-compatible file — and injects `MaxStreamingBitrate` into the
    PlaybackInfo request (`AllowVideoStreamCopy` was already `false`, so the cap is
    honoured and the resolution scales to match).
- **`src/components/TranscodeDownloadDialog.vue`** — reworked into a general
  "Download options" dialog:
  - compatibility badge (green "compatible" / amber "will be converted"),
  - resolution selector (presets filtered to the source height; "Original" = Auto),
  - reactive **estimated size** — single item shows its size, a season / multi-episode
    batch shows the **combined total**,
  - emits `maxBitrate` alongside audio/subtitle indices,
  - "Download original (may not play)" escape hatch shown only when incompatible.
- **`src/pages/ItemDetailsPage.vue`**
  - the dialog now opens for **every** video download (single + bulk), passing the
    item list (for the size total) and the compatibility flag,
  - audio-only items (music) still download directly — no video resolution dialog,
  - bulk downloads open the dialog once; the chosen quality/tracks apply to all.

## Validation

- `vue-tsc --noEmit` — clean.
- `vitest run` — 77/77 pass.

## Notes / possible follow-ups

- Size estimate for a downscaled preset is `bitrate/8 × runtime` (upper bound); the
  "Original" estimate prefers the real `MediaSources[0].Size` when present, else
  `sourceBitrate × runtime`. Bulk episode metadata may lack `Size`, so the Original
  total can fall back to bitrate-based estimation or "Unknown".
- Could persist the last chosen resolution as a default (via `preferencesStore`,
  which already holds `preferredBitrate`) — deliberately left out for now; the
  picker resets to "Original" each time.
- Web/dev preview does not transcode (native/desktop only), so the cap is a no-op
  there; the dialog still displays.
