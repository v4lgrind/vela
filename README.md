# Jellyfin V4lgrind Client

A modern Jellyfin media client built with Vue 3, Capacitor, and Electron. Android uses
native playback while Windows and Linux use the shared web player.

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite
- **Mobile:** Capacitor v8 (Android)
- **Desktop:** Electron (Windows and Linux)
- **Media Playback:** ExoPlayer (Media3) on Android, HLS.js/Chromium on desktop and web
- **State Management:** Pinia with persistence
- **API Client:** Jellyfin SDK
- **UI Components:** Reka UI (headless) + Lucide icons
- **Styling:** Tailwind CSS v4
- **Utilities:** VueUse

## Features

- 🎬 Browse and stream Movies, TV Shows, and Music
- 📱 Native Android app support
- Windows and Linux desktop packages
- 💾 Offline playback with cached item metadata, posters, backdrops, parent artwork, and cast portraits
- 🎵 Background audio playback
- 🔍 Search across your media library
- 📺 Android TV (Leanback) support
- 🌐 Support for local Jellyfin servers (HTTP cleartext)

Library filters, genre, sort order and page position are remembered per library
for the current session when opening a title and returning. New pages open at the
top; browser Back restores the previous scroll position. Recently added episodes
use their series poster in portrait cards when available. Tapping a video
timeline seeks to that point; dragging from anywhere adjusts the current time
relatively, without requiring the thumb to be grabbed precisely.
Home content is kept in memory while navigating between pages; use the refresh
button in the header to fetch fresh libraries, resume items, next-up items, and
recent additions.

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

**Output:** `android/app/build/outputs/apk/debug/mediaserver-client.apk`

#### Docker Android Build

With Docker installed, the container installs Node 22, JDK 21 and Android SDK 36.
It runs `npm ci`, the web build with type checking, Capacitor sync and Gradle
`assembleDebug`. No Android SDK is needed on the host.

```bash
docker build -f Dockerfile.android --target apk \
  --output type=local,dest=./out .
# APK: out/mediaserver-client.apk
```

The default local APK has Android `versionCode` 1. If the phone already has a
newer build installed, pass a higher code to preserve its app data during the
update (for example, `--build-arg ANDROID_VERSION_CODE=252` before `--target apk`
when the installed code is 251). CI builds use the workflow run number plus
1000, so keep local codes below 1000 to let published releases update a test
install. Then install without clearing app data:

```bash
adb install -r out/mediaserver-client.apk
```

Do not uninstall the existing app just to bypass a version downgrade.

To keep the build environment as an image instead of exporting only the APK:

```bash
docker build -f Dockerfile.android -t mediaserver-android .
container=$(docker create mediaserver-android)
docker cp "$container":/workspace/android/app/build/outputs/apk/debug/mediaserver-client.apk ./mediaserver-client.apk
docker rm "$container"
```

Rebuild the image after source changes. The APK uses the repository's fixed
debug-grade signing key; do not use that key for a public production release.

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

Offline media is stored in the user-visible `Videos/Jellyfin V4lgrind` folder on Windows,
`Downloads/Jellyfin V4lgrind` on Linux, and `Documents/Jellyfin V4lgrind` on Android.
Unsupported offline video formats are requested from Jellyfin as H.264/AAC MP4 files so
they remain playable on both Windows and Linux.

A download is only marked complete after its full item metadata and local artwork
have been cached. Opening Downloads while online also backfills these assets for
media downloaded by older app versions.

Windows development installers are currently unsigned. Smart App Control or an
organization policy may block them until they are code signed or explicitly allowed.

### Installing on Android Device

```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/mediaserver-client-debug.apk

# Or drag & drop the APK to your device
```

## Project Structure

```
mediaserver-client/
├── src/
│   ├── components/      # Vue components
│   ├── views/          # Page views
│   ├── services/       # API services (Jellyfin, downloads, offline DB)
│   ├── stores/         # Pinia stores
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

- **App ID:** `com.jellyfin_v4lgrind_client.app`
- **App Name:** Jellyfin V4lgrind
- **Web Directory:** `dist`
- **Cleartext Traffic:** Enabled (for local HTTP Jellyfin servers)

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

## License

MIT
