# Android System Media Controls Fix

**Date:** 2026-03-23

## Problem

Native Android media controls (lock screen, notification bar, Bluetooth headset buttons) could not control playback. All playback control was only available through the in-app UI in `NativePlayerActivity`.

## Root Cause

The codebase had no `MediaSession` implementation. Without a MediaSession, Android has no way to route system-level media control events to the app's player.

## Changes Made

1. **`android/app/build.gradle`** — Added `media3-session` dependency (`androidx.media3:media3-session:1.5.1`)
2. **`NativePlayerActivity.kt`** — Integrated `MediaSession` with ExoPlayer:
   - Import `androidx.media3.session.MediaSession`
   - Added `mediaSession` field
   - Created `MediaSession` after ExoPlayer is built (in `buildPlayer()`)
   - Released `MediaSession` in `onDestroy()` before releasing the player

## How It Works

Media3's `MediaSession` automatically:
- Publishes a media notification with play/pause/seek controls
- Shows playback controls on the lock screen
- Responds to Bluetooth media button events (play, pause, next, previous)
- Syncs state with the ExoPlayer instance (no manual state management needed)

## What's Left / Future Improvements

- Consider adding media metadata (title, artwork) to the MediaSession for richer notification/lock screen display
- Consider a `MediaSessionService` if background audio playback is desired (currently the activity pauses playback in `onPause`)
