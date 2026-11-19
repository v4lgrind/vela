# 2026-11-19 — UI polish pass (Vue + native player)

Scope chosen by the user: **refine the existing "Night Sky" world** (no redesign), on the Vue UI and the native video player. No specific pain point; this was a general consistency pass.

## How the screens were inspected
- No Jellyfin server, Android device or Java on this machine. A fake Jellyfin API (fictional titles, generated SVG artwork) was written in the session scratchpad and the built web app was screenshotted with Playwright at phone (412×915) and tablet (1400×1000) sizes. Those helpers are temporary and not committed.
- First attempt ran out of memory (~2 GB). After the user added RAM, the "after" screenshots were taken (phone, tablet, day theme) and the full build was run.

## Findings and changes
### Vue — detail page (`ItemDetailsPage.vue`)
- Series and season pages had **no primary action**. They now get a Star Blue button "Lire S1E6" / "Reprendre S1E6": for a series it uses the server's next-up episode (`fetchNextUp`), for a season the episode in progress, else the first unwatched one (`nextEpisodeOf`).
- Series/season download and "mark watched" buttons are now 50px icon squares like on the movie row (aria labels kept). The duplicate "Tout marquer vu" button in the Episodes header was removed (it did the same thing as the action-row button).
- The hero badge "3840x2160" became "4K" / "1080p" / "720p" / "SD", plus the HDR format (HDR10, HDR10+, HLG, Dolby Vision) when there is one (`resolutionLabel`, `hdrLabel` in `utils/detailMeta.ts`, with tests).
- The amber rating star (legacy `rating` color, against the One Star Rule) is now a neutral Lucide star, both in the hero and on episode rows.
- Primary buttons: weight 700→600, `text-body`, no shadow (content isn't floating chrome), and capped width on tablets (`md:flex-none md:min-w-[280px]`) instead of a 1000px-wide bar.
- Hero type moved onto the scale tokens (`text-caption`, `text-body`, `lg:text-page-wide`, `text-label`).
- Watched episodes: the whole row is no longer at 50% opacity (text was unreadable); only the thumbnail is dimmed and the title is muted.
- Checks on Star Blue fills now use `text-accent-ink` (Ink-on-Blue Rule) instead of white.
- The "download in progress" button is no longer red (it wasn't an error).
- The **Media info dialog** had English labels hard-coded ("Codec", "Bit Depth", "Direct Play"…) and raw values (`true`, `24500000`). Labels now go through i18n (`detail.info.*`, FR/EN), flags show Yes/No and bitrates show Mbit/s.

### Vue — other
- Library grid (`LibraryItemsPage.vue`): no `shadow-lg` on posters (Floating Chrome Rule). On phones the corner "watched" badge no longer duplicates the filled check in the action overlay. Title and year use `text-caption` / `text-label`. Neutral star in the list view.
- `main.css`: the day theme now redefines `--color-error` (#d43c3c), because #ff6b6b on white was 2.8:1.
- Raw `text-red-400/300` → `text-error` / `hover:text-error-dark` (AirPlay dialog, offline library, detail error).
- New i18n keys: `common.yes/no`, `detail.playEpisode`, `detail.resumeEpisode`, `detail.info.*`.

### Native player (Android, not compiled here)
- **Outfit added as a font resource** (`res/font/outfit_{regular,medium,semibold,bold}.ttf` + `outfit.xml`, OFL license in `android/app/src/main/OUTFIT_OFL.txt`) and set as the `AppTheme.NativePlayer` font. Before this, the player was in Roboto/monospace, so it looked like a different app.
- Times use Outfit with tabular figures (`tnum`) instead of monospace.
- "Skip intro" / "Next episode": Harbor Ink text on blue (it was white).
- Back button and subtitle "on" state: round over-video controls (black 40% / Star Blue tint), replacing the 8dp rectangles and the legacy navy `#1A1A2E`.
- Double-tap seek feedback: vector chevron icons instead of the « » characters.
- Trickplay preview and scrub time sit on a 12dp rounded panel (`bg_player_panel`).
- Options sheet: 16dp corners, Night Surface color, Lucide-style close icon (`ic_close`) at 44dp instead of the old Holo system icon.

## Verification
- `vitest run`: 228/228 (the `itemDetailsHero` test anchor was moved from `{{ videoCodec }}` to the `Body below backdrop` comment).
- `vue-tsc --noEmit`: clean.
- Impeccable detector: only advisories outside the scope (old colors in `main.css`).
- "After" screenshots checked: series/season "Reprendre S1E6" button, 4K/HDR10/HEVC badges, readable watched episodes, day theme. Tablet fix found at that point: the resume progress bar is now capped at the button's width (`md:max-w-[280px]`).
- `npm run build` (vue-tsc + Vite): OK. `npx cap sync android` + `./gradlew assembleDebug`: **BUILD SUCCESSFUL**, APK at `android/app/build/outputs/apk/debug/vela.apk` (the Outfit `.ttf` files are in `res/font/`).
- Toolchain installed on the system (at the user's request): JDK 21 via apt (`openjdk-21-jdk-headless`), Node 22 in `/opt/nodejs` (links in `/usr/local/bin`, which shadow apt's Node 18), Android SDK in `/opt/android-sdk` (owned by `dev`, platform 36 + build-tools 36.0.0 + platform-tools), variables in `/etc/profile.d/android-sdk.sh` (sourced from `~/.bashrc`), Gradle cache in `~/.gradle`. `android/local.properties` now has `sdk.dir=/opt/android-sdk` (the old value pointed to `/home/v4lgrind/android-sdk`, which doesn't exist on this machine). `npm run android:build` passes from a clean login shell.

## Next steps
1. Install the APK and check the player on the Pixel 10 / OnePlus Pad: Outfit font, skip/next buttons, sheet, seek feedback (not visible without a device).
2. On a real server: series/season page (primary "Lire SxEy" button), media info dialog in French, library grid on phone and tablet.
3. Left alone on purpose: semantic colors in toasts and the transcode dialog (success/warning), the green/blue colors in the native stream-info overlay (`NativePlayerActivity.kt` ~l.1523), the Logs page.
4. Possible follow-up: a library tile whose locally cached image fails shows a placeholder without the library name (`LibrariesPage.vue` + `LazyImg`).
5. Remove the legacy tokens from `main.css` (orange/teal/green/rating, `--radius-*`), as DESIGN.md says.

## Same session — Android emulator
- The VM exposes KVM (nested virtualization): user `dev` added to the `kvm` group; installed `emulator` + `system-images;android-36;google_apis;x86_64` into `/opt/android-sdk`; AVDs `vela_phone` (Pixel 9 profile) and `vela_tablet` (Pixel Tablet profile) in `~/.android/avd`.
- Vela installed and checked on the emulator: login, home, detail page (4K/HDR10/HEVC badges, Outfit) and **the native player playing a real video** (DirectPlay): Outfit title/times, round buttons, stream-info sheet with the new close icon and 16dp corners.
- Fixed after seeing it on the emulator: the stream-info "DirectPlay" badge and the VIDEO/AUDIO headers were still Roboto bold (`Typeface.DEFAULT_BOLD`); they now use `R.font.outfit_semibold` (`NativePlayerActivity.kt`).
- Not checked: the double-tap seek feedback (adb taps are too slow to trigger a double-tap), skip intro / next episode (the fake API has no segments).
- Tools (fake API, screenshots, CDP driving, adb commands) saved in `~/.local/share/vela-dev/` with a README.

### Bug found (not fixed, product decision)
The app is served from `https://localhost` and `capacitor.config.ts` has no `android.allowMixedContent`: the WebView **blocks every request to an `http://` server on the LAN** (logcat: "Mixed Content … has been blocked"). `cleartext: true` isn't enough. PRODUCT.md promises "local HTTP (cleartext allowed)". Possible fix: `android: { allowMixedContent: true }`, then retest a LAN login.

## Same session — redesign explored, then paused
- `/impeccable` redesign: two hands of directions shown on the decision page for the phone Home (record crate, film-club programme, departure board, warm app; then living room at nightfall, video rental store, night metro map, cassette insert). The user asked for a second hand, then **dropped the redesign for now**: no direction chosen, no change to DESIGN.md.
- Sketches kept locally under `.impeccable/mocks/decision/` (not versioned) in case it's picked up again.
- Committed: only the fixes to the existing interface (above).
