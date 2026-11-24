# Vela — development notes

Technical documentation for contributors. Users: see the [README](../README.md).

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite
- **Mobile:** Capacitor v8 (Android)
- **Desktop:** Electron (Windows and Linux)
- **Media Playback:** ExoPlayer (Media3) on Android, HLS.js/Chromium on desktop and web
- **State Management:** Pinia with persistence
- **Servers:** Jellyfin (official SDK) and Plex (Plex Media Server and plex.tv APIs),
  behind Vela's own domain model (see [Architecture](#architecture) below)
- **UI Components:** Reka UI (headless) + Lucide icons
- **Styling:** Tailwind CSS v4
- **Utilities:** VueUse

## Jellyfin server compatibility

The client uses the Jellyfin 12 SDK (`@jellyfin/sdk` 1.x). Authenticated HTTP,
HLS, download and watch-progress requests use `Authorization: MediaBrowser`;
URLs assigned directly to a browser media element use the case-sensitive
`ApiKey` parameter because an element cannot attach headers. Do not restore
the legacy `api_key` query parameter or `X-Emby-*` token headers: Jellyfin 12
rejects them by default. Browser login, browsing, audio playback, HLS video
and subtitles were exercised against Jellyfin 12.1. Native Android playback
probes the device's MediaCodec profiles, levels, dimensions, display size, and
audio decoders before choosing direct play or a bounded server transcode.
Sources larger than the rotation-normalized display are transcoded even when
the decoder advertises support, avoiding wasteful and unstable 4K playback on
smaller screens. Native playback, subtitles, relative scrubbing and direct
timeline taps were verified on physical Android 14 and Android 17 devices.

## Plex server compatibility

Vela talks to Plex Media Server directly, as a Plex client:

- **Sign-in:** a plex.tv/link code (no password in the app), then the Plex Home
  profile (PIN when protected) and the server. Requests to the server carry that
  profile's server token; the plex.tv account token is kept in secure storage so
  the profile can be switched later without a new code.
- **Addresses:** every address of the server (LAN, public, relay) is probed in
  parallel and the LAN wins whenever it answers: going through the public address
  from home makes the router loop the stream back (NAT loopback), often at a few
  Mb/s. Vela searches again when the network changes (Wi-Fi ↔ mobile), when the
  app comes back on screen, and when a request gets no answer.
- **Video:** Vela decides direct play itself from the device's decoders (Plex's
  generic profile refuses files whose chosen audio track is not the first one).
  Otherwise it asks the universal transcoder for HLS with a client profile built
  from the device codecs: audio switch, quality cap and picture-subtitle burn-in
  map to Plex parameters. Watch progress goes through `/:/timeline`.
- **Music:** tracks play their original file (FLAC included, with seeking);
  the server converts only when a quality cap is set or the format is not
  playable. Finished tracks are scrobbled (Plex keeps no play count from a
  music timeline).
- **Downloads:** the original file, or a Matroska conversion when a quality is
  chosen. Seek-bar previews need Plex's "Generate video preview thumbnails"
  setting. Cast uses the Default Media Receiver with a stream URL.

## Architecture

Vela has its own media model in `src/domain` (items, streams, playback intent,
ports such as `MediaBackend`, `CatalogPort`, `PlaybackPort`). Each server kind is
a backend in `src/backends/<kind>` that implements those ports; the app reaches
backends only through `src/backends/registry.ts` and the session store.
`src/architecture.test.ts` enforces these boundaries (no server SDK outside its
backend, no backend import from the app). On Android, Android Auto browses a
native `MusicLibrary` (Jellyfin or Plex) configured by the app.

## Prerequisites

- **Node.js** 20+ and npm
- **JDK** 17 or 21 (for Android builds)
- **Android SDK** (for Android builds)

## Development

### Web Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build web app
npm run build

# Build without type checking (faster)
npm run build:skip-types

# Preview production build
npm run preview
```

### Android Development

```bash
# Sync web assets to Android
npm run cap:sync

# Open Android project in Android Studio
npm run cap:android

# Build debug APK (all-in-one command)
npm run android:build

# Build release APK
npm run android:release
```

#### Manual Android Build

```bash
# Build web app
npm run build:skip-types

# Sync to Android platform
npx cap sync android

# Build APK with Gradle
cd android
./gradlew assembleDebug  # or assembleRelease
```

**Output:** `android/app/build/outputs/apk/debug/vela.apk`

#### Signing

Published APKs (nightlies and releases) are release builds signed by
`scripts/sign-android-apk.sh` with the **release key**, rotated from the legacy
key committed in `android/app/signing.keystore` (APK Signature Scheme v3,
lineage in `android/signing/lineage.bin`). Android 9+ installs a rotated build
over a legacy-signed one and keeps its data; afterwards it refuses any APK
signed only with the legacy key, whose password is public.

- The release key is never committed. CI reads it from the
  `VELA_SIGNING_KEYSTORE_B64` and `VELA_SIGNING_PASSWORD` secrets.
- Locally, the script reads `~/.config/vela-signing/signing.env`
  (`VELA_SIGNING_KEYSTORE`, `VELA_SIGNING_PASSWORD`, `VELA_SIGNING_ALIAS`).
  `npm run android:build` and `npm run android:release` call it after Gradle;
  without the key the APK keeps the legacy signature, which installs on the
  emulator but not over a published build.
- To sign an APK built another way (Gradle directly, Docker):
  `scripts/sign-android-apk.sh path/to/vela.apk`.
- **Losing the release key means no more in-place updates**: keep a backup of
  `~/.config/vela-signing/` in a password manager.

#### Docker Android Build

With Docker installed, the container installs Node 22, JDK 21 and Android SDK 36.
It runs `npm ci`, the web build with type checking, Capacitor sync and Gradle
`assembleDebug`. No Android SDK is needed on the host.

```bash
docker build -f Dockerfile.android --target apk \
  --output type=local,dest=./out .
# APK: out/vela.apk
```

The default local APK has Android `versionCode` 1. If the phone already has a
newer build installed, pass a higher code to preserve its app data during the
update (for example, `--build-arg ANDROID_VERSION_CODE=252` before `--target apk`
when the installed code is 251). CI builds get their code from
`.github/scripts/android-version.sh`: `MAJOR*1000000 + MINOR*10000 + PATCH*100`
for a release (v1.5.0 = 1050000), plus the number of commits since that release
(1–99) for a nightly. Keep local codes below the next release so it can still
update a test install. Then install without clearing app data:

```bash
adb install -r out/vela.apk
```

Do not uninstall the existing app just to bypass a version downgrade.

To keep the build environment as an image instead of exporting only the APK:

```bash
docker build -f Dockerfile.android -t vela-android .
container=$(docker create vela-android)
docker cp "$container":/workspace/android/app/build/outputs/apk/debug/vela.apk ./vela.apk
docker rm "$container"
```

Rebuild the image after source changes. The APK keeps the legacy signing key:
sign it with `scripts/sign-android-apk.sh out/vela.apk` before installing it
over a published build (see [Signing](#signing)).

### Desktop Development

```bash
# Run Vite and Electron together
npm run desktop:dev

# Build an unpacked desktop application for the current OS
npm run desktop:package

# Build installers for the current OS
npm run desktop:dist
```

Desktop builds are platform-specific:

- Windows produces an NSIS `.exe` installer.
- Linux produces a portable `.AppImage` package.

The GitHub Actions desktop workflow builds both platforms independently.

Offline media is stored in the user-visible `Videos/Vela` folder on Windows,
`Downloads/Vela` on Linux, and `Documents/Vela` on Android.
Unsupported offline video formats are requested from the server as H.264/AAC files
(MP4 from Jellyfin, Matroska from Plex) so they remain playable after download.

A download is only marked complete after its full item metadata and local artwork
have been cached. Opening Downloads while online also backfills these assets for
media downloaded by older app versions.

Windows development installers are currently unsigned. Smart App Control or an
organization policy may block them until they are code signed or explicitly allowed.

### Installing on Android Device

```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/vela.apk

# Or drag & drop the APK to your device
```

## Project Structure

```
vela/
├── src/
│   ├── domain/         # Vela's media model and backend ports
│   ├── backends/       # jellyfin/ and plex/ backends + registry
│   ├── components/     # Vue components
│   ├── pages/          # Routed pages
│   ├── composables/    # Player and UI composables
│   ├── services/       # Downloads, offline DB, audio player
│   ├── store/          # Pinia stores (session, libraries, offline…)
│   └── router/         # Vue Router config
├── android/            # Capacitor Android platform
├── electron/           # Electron main process, preload, and media backend
├── dist/               # Built web app
├── electron-builder.yml # Windows and Linux packaging
├── capacitor.config.ts # Capacitor configuration
└── vite.config.ts     # Vite configuration
```

## Configuration

### Capacitor Config (`capacitor.config.ts`)

- **App ID:** `cloud.valgrind.vela`
- **App Name:** Vela
- **Web Directory:** `dist`
- **Cleartext Traffic:** Enabled (for local HTTP servers)

### Android Permissions

- `INTERNET` - Network access for streaming
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` - Background audio
- `WAKE_LOCK` - Prevent sleep during playback

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- [Android Studio](https://developer.android.com/studio) (for Android development)

## CI/CD

GitHub Actions builds:

- Android APKs with `.github/workflows/android-build.yml`.
- Windows NSIS installers and Linux AppImage packages with
  `.github/workflows/desktop-build.yml`.
- Manual versioned releases with `.github/workflows/release.yml`; a single
  release contains the Android APK, Windows installer, and Linux AppImage.

## Migration from Tauri

The Android application was migrated from Tauri v2 to Capacitor for:
- Simpler build process (no Rust/Cargo)
- Faster CI builds
- Better mobile-first ecosystem
- Smaller bundle sizes

Electron now provides the Windows and Linux desktop targets while the Vue frontend
remains shared across all platforms.
