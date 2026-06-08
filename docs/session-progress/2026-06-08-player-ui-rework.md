# Player UI rework — centered layout, unified native + web

Date: 2026-06-08

## Goal
Converge the two player control UIs (native Android ExoPlayer overlay + the web/dev-preview Vue overlay) onto one design: a centered "Netflix/Plex" layout with a unified visual language. Presentation-only — no playback/session logic changed.

## Locked design (from brainstorm)
- **Layout:** top bar `‹ back + title`; single large center play/pause; bottom bar `time` (left) + `audio · subtitles · quality · info · fullscreen` (right); full-width seekbar with chapter markers.
- **Gestures:** double-tap L/R = ±10s (kept, with ripple); single tap toggles controls. Removed: ±10s center buttons, mute button (web too).
- **Menus:** audio/subtitles/quality open a dark rounded **bottom sheet** (unified look).
- **Stream Info:** rich 2-column sheet (badges + Video/Audio) on both surfaces.
- **Skip Intro / Next Episode:** restyled to accent pill (`#7c3aed`).
- **Accent:** `#7c3aed` everywhere (native recolored from `#BB86FC`; web already on brand).

## Changes made

### Web
- **New** `src/components/PlayerBottomSheet.vue` — hand-rolled slide-up sheet (scrim, grab handle, header+close, check-marked rows, accent highlight, footer slot). Mirrors the existing hand-rolled info-modal pattern (not Reka, to avoid teleport/z-index issues in the `fixed z-[100]` player).
- `src/pages/PlayerPage.vue`:
  - Top bar = back + `mediaTitle` (reuses existing `buildMediaTitle()`, set in both online + offline `onMounted` paths).
  - Center large play/pause (gated `!isLoading` so it doesn't sit over the loader).
  - Bottom bar = time + icon row; removed mute button + `toggleMute`/`isMuted`.
  - The 3 inline dropdowns → 3 `<PlayerBottomSheet>` (new `audioSheetItems`/`subtitleSheetItems`/`qualitySheetItems` computeds; subtitle-size stepper moved to the subtitle sheet footer).
  - Sheet toggles made mutually exclusive; `anyMenuOpen()` keeps controls visible while any sheet is open.
  - Skip Intro restyled to accent pill.

### Native Android
- Recolored `#BB86FC` → `#7c3aed`: `seekbar_progress.xml`, `seekbar_thumb.xml`, `bg_player_button_selected.xml` (stroke), spinner `indeterminateTint`.
- `res/layout/activity_native_player.xml`: top row now back + title only; new centered 72dp `btn_play_pause` (`bg_center_play`); bottom row = time + `audio/subtitle/quality/info/fullscreen`; added `bottom_scrim`; Skip/Next use `bg_skip_button`. **All existing IDs preserved.**
- **New** drawables: `bg_bottom_sheet`, `bg_center_play`, `bg_controls_scrim_bottom`, `bg_skip_button`, `bg_sheet_row_selected`, `bg_grab_handle`, `ic_check`. **New** layouts: `bottom_sheet_options`, `item_sheet_option`, `view_stream_info`. **New** anims `sheet_slide_in/out` + `BottomSheetAnim` style.
- `NativePlayerActivity.kt`: added custom `showOptionSheet()` (Dialog @ bottom gravity, slide anim — no Material dependency) + `buildSubtitleSizeFooter()`; rewrote audio/subtitle/quality pickers to use it (all broadcast intents + branching preserved); removed dead `showSubtitleSizePicker`; rewrote `showStreamInfoDialog` to inflate `view_stream_info` with programmatic badge/section/row helpers.

## Verification
- `npm run build` (vue-tsc + vite) → **PASS** (exit 0).
- `npx cap sync android` + `./gradlew assembleDebug` → **BUILD SUCCESSFUL** (all new resources linked, Kotlin compiles).

## Left to do / next steps
- **On-device visual QA** (not done here — no device): install the debug APK and walk the checklist — title, centered play/pause, double-tap ±10s, bottom sheets slide/select/persist, subtitle-size footer, rich Stream Info, Skip Intro/Next Episode styling, quality switch still re-transcodes, audio fallback intact, accent parity with web.
- Consider removing the now-inert `handleClickOutside` + dead dropdown refs in `PlayerPage.vue` (kept to avoid churn; harmless, satisfies `noUnusedLocals`).
- Optional: immersive-mode handling for the native bottom-sheet Dialog (system bars may transiently appear on show — same behavior as the old AlertDialogs).
