# 2026-11-22 — Plex support: analysis & plan

## Investigated
- Mapped every place Jellyfin is assumed: `jellyfin-store.ts` (auth + ~35 data
  methods), raw `fetch` calls in the player composables, audio service,
  download/sync services, persisted data (IndexedDB `jellyfinItem`, metadata
  cache, token keys) and the Kotlin side (`JellyfinLibrary.kt` for Android Auto,
  `ArtworkProvider`, `TrickplayThumbnails`, `CastPlugin`).
- Pages consume Jellyfin `BaseItemDto` fields directly (`Id` ×224, `Type` ×139,
  `UserData` ×64…; ≈250 refs in `ItemDetailsPage.vue`).
- Playback fallbacks are encoded as edits to a Jellyfin `DeviceProfile`.
- `node_modules` is missing in this worktree (tests not run).

## Decisions
- v1 (Plex mapped into Jellyfin DTOs) rejected by the user: not clean.
- v2: Vela domain model (`src/domain`), ports (`MediaBackend`), two backends
  (`src/backends/jellyfin`, `src/backends/plex`), playback expressed as intent
  (`PlaybackRequest` → `PlaybackPlan`), dependency rule enforced by a test.
  Strangler migration: Jellyfin refactor shipped first, then Plex.

## Changes made
- `docs/superpowers/plans/2026-11-22-plex-support.md` (plan v2, phases 0–10,
  Phase 0 results section).
- Phase 0 done: `npm ci`, baseline green (228 tests); plex.tv/link login and
  read-only capture against the user's Plex server; fixtures anonymised and
  leak-checked into `src/backends/plex/__fixtures__/`; Jellyfin fixtures from
  the fake dev server into `src/backends/jellyfin/__fixtures__/`.
- Rule recorded in memory: tests only with the managed Plex Home profile the
  user created for Claude, on the user's server; never the owner account (its
  tokens were deleted from the scratchpad).
- Playback verified with that profile: direct play (Range), transcode decision
  (needs `X-Plex-Client-Profile-Extra`), HLS start/segments/stop; watch state
  unchanged. `decision.json` fixture added.
- Plan corrected: `NativeVideoPlugin` must take a headers map (today a single
  `Authorization` header).
- A local Plex Media Server 1.43.5 was installed on the dev machine
  (`plexmediaserver` service, ports blocked to non-loopback via iptables,
  synthetic media in `/srv/vela-plex-test`, generator
  `~/.local/share/vela-dev/plex-media.sh`); the user does not want it used, so
  it was fully removed (package purged, data, `plex` user, media, script and
  iptables rules gone). ffmpeg (apt) stays installed.
- Plex account token and raw (non-anonymised) captures live only in the session
  scratchpad, outside the repo.

- User answers: plex.tv/link only; Plex v1 = video only; real server + Plex
  Pass available; Android Auto/Cast/trickplay later; Plex Home supported;
  Jellyfin-only refactor ships first. Recorded in the plan's "Decisions".

- Phase 1 done: `src/domain/*`, Jellyfin and Plex mappers with fixture
  tests, `src/architecture.test.ts`. 266 tests green, type check and build OK.
  Details in the plan's "Phase 1 results".

- Phase 2 done (2026-11-23): session store, Jellyfin authenticator, legacy
  account migration; see the plan's "Phase 2 results".

- Phase 3 progress (2026-11-23): 3a backend catalog (commit 015d7e9), 3c home /
  libraries / search / person (1af2669), library grid (0816d97). 3d in progress
  (uncommitted): domain stream technical fields + `domain/streams.ts`,
  `detailMeta` on domain items, transcode dialog on domain versions, download
  options take domain stream ids, `checkNeedsTranscode(item)` via a local
  domain→codec shim. Remaining for 3d: `ItemDetailsPage.vue` itself, then drop
  the legacy union in `TrackActionsMenu` and `download-store.startDownload`.

- Phase 3 done (2026-11-23): see the plan's "Phase 3 results".

- Phase 4 done (2026-11-23): playback port (4a c0524f0) and player migration
  (4b). Verified: 299 tests, golden PlaybackInfo scenarios, web playback in
  Chromium, native ExoPlayer playback on the `vela_phone` emulator (codec probe
  → HEVC excluded → playback to the end), legacy account migrated on device.
  See the plan's "Phase 4 results".

- Phase 5 done (2026-11-23): music through `backend.music`; see the plan.

- Phase 6 done (2026-11-23): downloads and offline on the domain; old
  download records are converted on load. See the plan's "Phase 6 results".

- Phase 7 done (2026-11-23): legacy Jellyfin store and types deleted, SDK
  confined to its backend by the architecture test; old-format downloads
  checked in the web build. See the plan's "Phase 7 results".

- Phase 8 done (2026-11-23): Plex backend (auth, catalog, playback, login UI,
  profile switch, players' headers map). Tested live with the managed
  "claude" profile only. Incident: during the emulator run the CDP script that
  blocked watch-state calls disconnected before the app was stopped, so a few
  `/:/timeline` "paused" calls (~10 s position) reached the server as
  "claude"; its watch state stayed empty (checked). See the plan's
  "Phase 8 results".

## Next steps
- User test on a phone: sign in to Plex with the real plex.tv/link code
  (owner account approves), pick a profile, play, check resume / watched state.
- Release (Jellyfin refactor + Plex v1), user's decision.
- Phase 9: Plex music, downloads, Android Auto, Cast, BIF trickplay;
  split `ItemDetailsPage.vue`.
