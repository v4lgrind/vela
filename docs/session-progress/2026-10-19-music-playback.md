# Music playback overhaul — 2026-10-19

All work tested on the OnePlus Pad Go (Android 14) over wireless ADB, then
committed and pushed straight to `main` one step at a time (user's request).

## Investigation
- Music used an `<audio>` element in the WebView. On the device: 0 media
  sessions, no notification, headset pause key ignored. Sound did keep going
  with the screen off for 30 s, but nothing kept the process alive.
- Album pages showed a giant `?`: the page always requested a Backdrop image,
  albums rarely have one, and the 404 fell back to the error placeholder.
- `getPlaceholderImage()` expects keys like `album`/`person` but callers pass
  Jellyfin types (`MusicAlbum`…), so every placeholder was the `?` one.
- `ItemDetailsPage` had three root nodes, so the bottom-nav padding App.vue
  passes to the router view never applied (last track hidden under the nav).

## Changes (commits on main)
1. `fix(details)`: album hero shows the cover over a blurred copy when there
   is no backdrop; items without `BackdropImageTags` no longer request one.
2. `fix(details)`: single root element so the bottom padding applies.
3. `feat(audio)` native playback: `MusicService` (Media3
   `MediaSessionService` + ExoPlayer, FFmpeg extension renderers) and the
   `NativeAudio` Capacitor plugin (MediaController bridge, `stateChange`
   events every second while playing). JS: `audioPlayerService` orchestrates;
   engines in `src/services/audio/` (native, and `<audio>` for the web
   preview). Store actions are intents; engine state is mirrored back.
   Native streams use progressive MP3 transcoding (ExoPlayer can't follow
   the universal endpoint's redirect to HLS).
4. `feat(audio)` queue: shuffle (current track keeps playing), repeat
   off/all/one, Play next / Add to queue (track menu + album menu), drag to
   reorder and remove in the queue view, queue + position persisted and
   restored paused after a restart. Engine commands are serialized.
5. `feat(music)` browsing: Albums / Artists / Songs / Playlists tabs in music
   libraries, artist page (albums grid, Play all, Shuffle), album → artist
   link, playlist track lists, placeholder type mapping, square artist
   placeholder.
6. `feat(audio)`: draggable seek slider, swipe down to collapse the
   full-screen player, Settings > Music Quality (bitrate cap → MP3).

## Verified on device
- Notification + lock-screen session, media keys, next/previous, track
  auto-advance with the screen off, Jellyfin "now playing" report.
- Queue ops compared against native `getState()` after each operation.
- Restart restore, real-finger drag reorder and seek, swipe to collapse.
- FLAC served as-is at Original, as MP3 when capped at 128 kbps.

## Not verified / left to do
- Playlist detail page: the server has no audio playlists, so it is
  untested with real data.
- Offline (downloaded) tracks through the native engine
  (`downloadService.getNativeFileUri`) — not exercised this session.
- Restoring when the service outlives the WebView (`getState` path) is
  implemented but only the cold-start path was tested.
- Mini player progress bar is still tap-only (3 px tall).
- Album duration shows only the tracks Jellyfin has (e.g. "6m" for 3 tracks).

## Follow-up: music casting
- `CastAudioPlugin.kt` + `CastAudioEngine`: the queue plays on a Google Cast
  device through the **Default Media Receiver** (`CC1AD845`), which works on
  speakers too; the device fetches the Jellyfin stream URLs itself (ALAC is
  transcoded, downloaded tracks are streamed). While a session is up,
  `audioPlayerService` swaps engines; on disconnect the queue returns to the
  tablet paused at the cast position.
- Cast discovery filters by receiver: with the Jellyfin receiver (static
  default, used by the video cast button) the Nest Mini never showed up.
  `CastAudioPlugin` sets the DMR at load and runs passive MediaRouter
  discovery while in the foreground; `CastPlugin.showPicker` switches back
  to the Jellyfin receiver and ignores sessions of other receivers.
- Verified with "Salon Nest Mini": discovery, connect, play, next, seek,
  pause, header/mini player show the device, disconnect → local resume.
- Not verified: Chromecast / Google TV (none online), and the video cast
  button with the receiver switching (still never tested on hardware).
