# Accessible offline storage

## Investigation

- Electron stored offline media below its private `userData/media` directory.
- Android's foreground download service wrote below the app-private `filesDir` directory.
- Android offline playback and deletion assumed app-private relative paths, including for SRT sidecars.

## Changes

- Desktop downloads now target the system `Downloads/Jellyfin V4lgrind` directory.
- Electron migrates the legacy `userData/media/Jellyfin V4lgrind` tree at startup and keeps a legacy read fallback.
- Android 10+ publishes media and subtitle sidecars through `MediaStore.Downloads` under
  `Download/Jellyfin V4lgrind`.
- Android 7-9 writes to the public Downloads directory after requesting the legacy storage permission.
- Download metadata now stores the public Android URI returned by the foreground service.
- Android playback, subtitle parsing, stat, deletion, cancellation, and killed-app reconciliation accept public URIs.
- Android artwork remains in private app storage; desktop artwork follows the migrated media tree.
- README storage documentation now describes the public locations.

## Validation

- `npm run build`: passed.
- `npm test`: 12 files and 77 tests passed.
- `gradlew assembleDebug`: passed with SDK 36.
- `electron-builder --dir`: passed using `release/validation` because the existing `release/win-unpacked` was locked.

## Next steps

- Test a new movie, episode with SRT sidecar, and audio download on a physical Android device.
- Verify that deleting an offline item removes its public media and subtitle entries.
- Existing Android private downloads remain readable; re-downloading an item moves it to public storage.
