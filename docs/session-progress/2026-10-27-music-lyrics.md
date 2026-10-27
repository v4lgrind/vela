# Music lyrics — 2026-10-27

## Found
- Jellyfin serves lyrics at `GET /Audio/{id}/Lyrics` (SDK `getLyricApi`),
  404 when a track has none. Lines carry `Start` in ticks when synced.
- The server has 884 of 2001 tracks with `HasLyrics`.
- The full-screen player is Vue (`ExpandedAudioPlayer.vue`), mounted only
  while expanded; the engine reports the position about once a second.

## Changes (uncommitted)
- `jellyfin-store.fetchLyrics(itemId)`.
- `src/utils/lyrics.ts` (+ test): ticks → seconds, synced detection,
  active line index.
- `AudioLyrics.vue`: synced lyrics with the current line highlighted and
  kept centred (position interpolated between engine reports, auto-follow
  paused 3 s after a manual scroll), tap a line to seek; plain scrolling
  text for unsynced lyrics.
- `ExpandedAudioPlayer.vue`: mic button in the header (only when the
  current track has lyrics) swaps the cover for the lyrics; controls stay.
  Swipe-to-collapse ignores a scrolled lyrics view.
- i18n `audio.lyrics` (en/fr).

## Verified on the Pixel 10 (debug APK, versionCode 31)
- "Chant Down Babylon": button shows, 41 lines, line highlighted in time
  and centred at 0:38, tapping a line seeks.

## Sync check (user reported a desync)
- Native position vs wall clock: < 0.1 s drift over 10 s; store time is
  within ~30 ms of a fresh `NativeAudio.getState()`. FLAC direct play.
- Lines lit 100–300 ms late: the interpolation ticked every 200 ms and
  stayed frozen up to 200 ms after each engine report, plus a 300 ms
  colour fade. Now driven by `requestAnimationFrame` and a 100 ms fade:
  a line lights within 20–40 ms of its LRC timestamp (APK versionCode 32).
- Anything still heard as off would come from the LRC timing itself or
  output latency (Bluetooth). User confirmed the sync is fine on v32.

## Not verified / next
- Unsynced (plain text) lyrics: no such track tested.
- Offline tracks: the fetch fails, so no lyrics button.
- The lyrics view resets to the cover each time the player is reopened.
- Lyric `Metadata.Offset` is ignored.
