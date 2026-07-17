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
- 💾 Offline downloads for media playback
- 🎵 Background audio playback
- 🔍 Search across your media library
- 📺 Android TV (Leanback) support
- 🌐 Support for local Jellyfin servers (HTTP cleartext)

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

**Output:** `android/app/build/outputs/apk/debug/mediaserver-client-debug.apk`

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
