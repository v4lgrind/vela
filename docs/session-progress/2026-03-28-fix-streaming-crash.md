# Fix Streaming Crash on Android

**Date:** 2026-03-28

## Problem

App crashed before displaying video stream on Android devices. The crash occurred during NativePlayerActivity initialization.

## Root Cause

Duplicate `MediaSession` creation in `NativePlayerActivity.kt`:

1. `buildPlayer()` (line 795-796) created a MediaSession for the ExoPlayer
2. `setupMediaNotification()` (line 838) created a **second** MediaSession for the same player without releasing the first

With `targetSdkVersion = 36` and Media3 1.5.1, two active sessions on the same player caused an `IllegalStateException` crash.

## Changes Made

**File:** `android/app/src/main/java/.../NativePlayerActivity.kt`

- Removed premature `MediaSession` creation from `buildPlayer()` — let `setupMediaNotification()` be the single owner
- Added proper cleanup in `setupMediaNotification()` (release old session + notification manager) to support player rebuilds (DV fallback, software decoder retry)
- Wrapped `buildPlayer()` call in `onCreate()` with try-catch to prevent unhandled Activity crashes and report errors back to Vue
- Guarded `unregisterReceiver(commandReceiver)` in `onDestroy()` against `IllegalArgumentException` when the receiver was never registered (early finish path)

## Next Steps

- Test on physical Android device to confirm crash is resolved
- Monitor for any MediaSession lifecycle edge cases during quality switches and codec fallbacks
