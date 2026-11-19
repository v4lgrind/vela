# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The interface is Vue 3 rendered in a Capacitor v8 WebView with its own design language (not Material / Compose). The shipping targets are Android phones and tablets only. The Electron (Windows/Linux) and Android TV builds are side builds: they must keep working, but no design decision is made for them.

## Users

The owner of the project first, then other Jellyfin self-hosters once it is released publicly (direct APK first, Play Store later as "Vela for Jellyfin").

The primary user runs a home Jellyfin server and uses Vela on an Android phone (Pixel 10) and an Android tablet (OnePlus Pad, portrait and landscape). Their jobs:
- browse and play movies, series and music from the home server, on Wi-Fi or remotely;
- download titles at a chosen resolution and watch or listen offline (travel, no network);
- listen to music in the background, on Android Auto, with synced lyrics.

The public audience is technical enough to run a Jellyfin server, but expects a consumer-grade app.

## Product Purpose

Vela is a Jellyfin client for Android that makes a self-hosted library feel like a polished streaming app: it plays almost anything natively without needless transcoding, keeps working offline, and treats music as a first-class citizen. Success means the owner uses it instead of the other clients every day, and it is solid and clear enough to release publicly.

## Positioning

What sets Vela apart from the official Jellyfin app, Findroid and Streamyfin, all together:
- **Smart native playback.** ExoPlayer (Media3) probes the device's MediaCodec profiles, levels, dimensions, display size and audio decoders. It direct-plays when it can and asks the server for a bounded transcode only when needed (HEVC, sources larger than the display, PGS subtitles burned in, Atmos/unsupported audio).
- **Offline as a first-class mode.** Downloads with a resolution picker, a full offline library with posters, backdrops, parent artwork and cast portraits, and an explicit offline mode (Settings toggle or no device network; no automatic switching from server pings).
- **Music done well.** Background audio, Android media controls, Android Auto, a full-screen player with synced lyrics, library shuffle.
- **A calmer, more considered interface** than the other clients.

## Operating Context

- Phone in portrait with a bottom navigation bar; tablet in landscape with a left navigation rail (≥ 1024 px); edge-to-edge Android with system bars.
- Video playback hands off to the native ExoPlayer activity; the web player (HLS.js) is used only in the dev preview and on desktop.
- Home server reached over local HTTP (cleartext allowed) or remotely; Jellyfin 12 (SDK 1.x). Auth uses `Authorization: MediaBrowser`; media URLs use `ApiKey`.
- Primary sections: Home (resume, next up, recently added), Libraries, Library items (filters, sort, A–Z index), Item detail, Person, Search, Downloads / Offline library, Settings, Logs, Player.
- The UI is in French and English, following the device language.

## Capabilities and Constraints

- Stack: Vue 3 + TypeScript + Vite, Capacitor v8, Pinia (persisted), Reka UI / shadcn-vue primitives, Tailwind CSS v4, Lucide icons, vue-i18n, Jellyfin SDK. These are set by the codebase.
- Light and dark themes are both supported and must both stay readable.
- Every user-facing string goes through i18n with identical FR/EN keys (enforced by tests, including a guard against hard-coded text).
- Native Android strings (notifications, native player, Android Auto) live in `res/values{,-fr}/strings.xml`.
- "Jellyfin" must never be used as the product name (trademark). The product is "Vela"; "for Jellyfin" appears only in descriptions.
- Package ID `cloud.valgrind.vela` is locked in. The offline folder is `Documents/Vela`.
- Open: the Play Store listing assets (512 px icon, feature graphic) are not made yet.

## Brand Commitments

- Name: **Vela** (Latin for "sail", also a constellation).
- Logo: "Voile d'étoiles". Stars trace a sail shaped like a play triangle. Background `#04121F`, white stars `#F5F8FA`, blue stars `#2F9BFF` (the app's accent). Sources: `android/app/src/main/res/drawable/ic_launcher_foreground.xml` (reference geometry), `icons/`, `assets/`, `public/favicon.svg`.
- Author / publisher name: V4lgrind. License: MIT.

## Evidence on Hand

- Real behavior verified on physical Android 14 and Android 17 devices (Pixel 10, OnePlus Pad), as recorded in `docs/session-progress/`.
- Logo and icon set listed above; earlier screen explorations in `design-mockups/` (exploratory, not binding).
- No users, testimonials, ratings, download counts or press yet. Do not invent any.

## Product Principles

1. **Play it right the first time.** Choosing direct play or transcode is the product's job, not the user's; surface playback details only when they help.
2. **Offline is a normal state, not an error.** Downloaded content should be just as browsable and good-looking as online content, and mode changes happen only when the user or the device's network causes them.
3. **Music and video are equals.** Audio features (background play, lyrics, Auto) get the same care as video.
4. **Calm over clever.** Keep the interface quiet and predictable so the user's own media is the most vivid thing on screen.
5. **Ready for strangers.** Every change should hold up for a public user on a different server and device, in French or English.

## Accessibility & Inclusion

- Touch targets at least 44 px (buttons, inputs, small card actions use an expanded hit area).
- Bilingual FR/EN UI driven by the device locale; no hard-coded text.
- Light and dark themes must both meet readable contrast.
- No formal WCAG level has been committed to yet.
