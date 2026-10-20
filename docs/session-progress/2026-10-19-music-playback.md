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

## Follow-up: AirPlay (Apple TV), 2026-10-20
- Sender: [music-assistant/airplay-cli](https://github.com/music-assistant/airplay-cli)
  (`cliairplay`, GPL-3.0) cross-compiled for arm64 with NDK r27c against a
  static OpenSSL 3.5.9 — `native/airplay/` (Dockerfile + build.sh; rebuild
  with `docker build -f native/airplay/Dockerfile --output
  type=local,dest=android/app/src/main/jniLibs native/airplay`). Shipped as
  `jniLibs/arm64-v8a/libcliairplay.so` and executed from
  `nativeLibraryDir` (needs `useLegacyPackaging = true`).
- `AirPlayManager.kt`: a `TeeAudioProcessor` at the end of the ExoPlayer
  audio chain copies decoded PCM (resampled to 44.1 kHz, stereo s16) to
  cliairplay's stdin while the local output is muted; commands (START,
  FLUSH, VOLUME, metadata, artwork) go through `--cmdpipe`. Apple TV
  remote buttons (`[EVENT] remote command=`) drive the player.
- Apple TVs need a one-time PIN pairing (`--pair-setup`); credentials are
  stored per device in SharedPreferences `airplay` with a fixed DACP id.
- Android blocks PTP ports 319/320; cliairplay falls back to NTP timing.
- `AirPlayPlugin.kt` (NSD discovery of `_airplay._tcp`, connect, pairing)
  + `AirPlayDialog.vue` (button in the full-screen player).
- Verified on the tablet with the Apple TV "Télévision": pairing via the
  dialog, connect while paused, play, next, seek, pause, artwork on the TV,
  Stop AirPlay.
- Not verified: AirPlay speakers (HomePod/AirPort),
  long sessions / Wi-Fi drops, arm32 devices (only arm64 is built).
- Volume slider → TV volume: verified by the user (2026-10-20).

## Follow-up: 16 KB pages and one player at a time, 2026-10-20
- The Pixel 10 (16 KB page size) warned the app was incompatible:
  `libcliairplay.so` was linked with 4 KB segments. `build.sh` now links
  with `-Wl,-z,max-page-size=16384` (check: `readelf -lW <so>` → LOAD align
  `0x4000`). Any future native binary needs the same.
- Opening a video (`PlayerPage`) now stops the music whenever the mini
  player is visible, not only while playing; the mini player has a close
  (✕) button that stops the queue and drops the notification.
- Verified on the tablet and the Pixel 10 (nightly 1276).

## Follow-up: output picker on home, Libraries tab, 2026-10-20
- Home header has AirPlay and Cast buttons, so the output can be chosen
  before anything plays. Cast is now offered whenever the Cast framework is
  present (passive discovery kept missing the sleeping Nest Mini; the
  chooser dialog scans actively).
- cliairplay ends a session after 2 min without audio (`[STATUS]
  idle_timeout`, connected-but-idle or paused). `AirPlayManager` now keeps
  the device in standby and spawns a new session when playback starts,
  without an error toast. Verified: connect from home, wait 2 min, play.
- New "Biblio." bottom-nav tab (`LibrariesPage.vue`, route `libraryList`):
  library tiles with a type icon; `libraryItem` pages keep this tab active.
  Offline guards (router + App.vue) include the new route.
- Verified on the tablet and the Pixel 10 (nightly 1279).

## Follow-up: music search, trickplay, Android Auto, 2026-10-20
- **Search** (`SearchPage.vue`): artists, albums and songs alongside
  movies/shows/episodes, with their own tabs; a song plays with the other
  matching songs queued.
- **Trickplay thumbnails** (`TrickplayThumbnails.kt`, native player): the JS
  passes the item's `Trickplay` info (now requested in `fetchItemDetails`)
  as `trickplayJson`; sheets are fetched on demand, tiles cut with a
  `BitmapRegionDecoder`. Shown above the seek-bar thumb while dragging and
  above the time during long-press scrub. Server state: ~96 % of movies
  have trickplay, sampled episodes none (TV libraries likely have it off).
- **Android Auto**: `MusicService` is a `MediaLibraryService`;
  `JellyfinLibrary.kt` builds the tree (Ajouts récents / Albums / Artistes /
  Playlists), search and voice queries natively from credentials the app
  saves via `NativeAudio.setLibraryConfig`. Car picks (`track:<id>:<parent>`,
  `album:<id>`, voice query) are resolved in `onSetMediaItems`; the app adopts
  such a queue on the `externalQueue` event. Artwork through
  `ArtworkProvider` (`content://<pkg>.artwork/<itemId>`).
- Verified on the tablet with a temporary MediaBrowser debug method (since
  removed): root/latest/albums/artists/album/artist/search lists, artwork
  bytes, track pick → whole album at the right index, voice query, app
  adopting the queue, normal in-app playback unchanged.
- In the user's car (Pixel 10, nightly 1285): the app shows up in Android
  Auto. Browsing/playing there not yet reported.
- Not verified: Desktop Head Unit (no display on the build host). Sideloaded apps only show in Android Auto with its developer
  setting "Unknown sources" on. Playback reporting to Jellyfin only runs
  while the app's WebView is alive.
