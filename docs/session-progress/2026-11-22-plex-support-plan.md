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

## Next steps
- Phase 3: `JellyfinBackend.catalog` + `imageUrl`, then switch screens one by
  one to domain types (home → libraries → grid → details → search → person).
- Commits: one per phase on `v4lgrind/plex-support`.
