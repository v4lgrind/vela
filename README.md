# Jellyfin V4lgrind Client

A modern Jellyfin media client built with Vue 3 + Capacitor. Stream your media library and download content for offline viewing on Android devices and desktop.

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite
- **Mobile/Desktop:** Capacitor v8
- **Media Playback:** Shaka Player
- **State Management:** Pinia with persistence
- **API Client:** Jellyfin SDK

## Features

- 🎬 Browse and stream Movies, TV Shows, and Music
- 📱 Native Android app support
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
├── dist/              # Built web app
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

GitHub Actions workflow (`.github/workflows/android-build.yml`) automatically builds Android APKs on push to main.

**Build time:** ~8 minutes (vs ~15 min with previous Tauri setup)

## Migration from Tauri

This project was migrated from Tauri v2 to Capacitor for:
- Simpler build process (no Rust/Cargo)
- Faster CI builds
- Better mobile-first ecosystem
- Smaller bundle sizes

All functionality preserved, including offline downloads via Capacitor Filesystem API.

## License

MIT
