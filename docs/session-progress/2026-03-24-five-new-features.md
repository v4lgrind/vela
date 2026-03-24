# Session Progress — 2026-03-24 — Five New Features

## Overview

Implemented 5 new features across the Jellyfin Android client.

---

## Feature 1: Person Detail Page ✅

Tapping a cast member in ItemDetailsPage now navigates to their filmography.

**Files changed:**
- `src/store/jellyfin-store.ts` — added `fetchPersonDetails(personId)` and `fetchPersonFilmography(personId)` using `getItemsApi` with `personIds` filter
- `src/router/index.ts` — added `/person/:id` route (`PersonDetail` name)
- `src/pages/ItemDetailsPage.vue` — added `@click="navigateToPerson(p.Id)"` + `cursor-pointer` to cast div; added `navigateToPerson()` function; added `Tv2` + `CastPlugin` imports; added `onUnmounted` import
- `src/pages/PersonDetailPage.vue` — **new file**: hero section (portrait + name + bio), filmography 3-col grid, same poster pattern as LibraryItemsPage

---

## Feature 2: Server Switcher ✅

Multiple Jellyfin servers/accounts can be saved and switched without re-entering credentials.

**Files changed:**
- `src/store/jellyfin-store.ts` — added `SavedServer` interface (exported), `savedServers: SavedServer[]` to state (persisted), `_upsertSavedServer()`, `switchServer()`, `removeServer()` methods; `login()` now auto-saves the server after successful auth (fetches `serverName` via `getSystemApi`); added `getSystemApi` + `getUserApi` imports
- `src/pages/SettingsPage.vue` — added "Account" section at top: current server name/URL, "Switch Server" button, "Sign Out" button; added `useJellyfinStore`, `useRouter`, `LogOut` icon imports
- `src/pages/LoginPage.vue` — fully rewritten: shows saved server list when available (tap to instant-switch); "Add new server" expands the standard form; Quick Connect section integrated (see Feature 5)

---

## Feature 3: Android TV D-pad Navigation ✅

Arrow key / D-pad navigation for the existing Vue UI (no new native layouts).

**Files changed:**
- `src/composables/useDpadNavigation.ts` — **new file**: spatial navigation composable using `getBoundingClientRect()` geometry; finds nearest focusable element in the requested direction (primary + 0.5 × cross-axis distance scoring); Enter key clicks `tabindex="0"` elements
- `src/App.vue` — calls `useDpadNavigation()` globally; added import
- `src/assets/main.css` — added `:focus-visible` outline styles (`2px solid #7c3aed`) for D-pad navigation feedback

**Note:** Pages don't have `tabindex="0"` added yet — this can be done incrementally per page as needed. The composable already works with all `button`, `a`, and `input` elements.

---

## Feature 4: Chromecast (Jellyfin Official Receiver) ✅

Cast button appears in ItemDetailsPage for playable items when a Cast device is detected.

**Files changed:**
- `android/app/build.gradle` — added `com.google.android.gms:play-services-cast-framework:21.5.0`
- `android/app/src/main/AndroidManifest.xml` — added `CastOptionsProvider` meta-data
- `android/app/src/main/java/.../MainActivity.java` — registered `CastPlugin`
- `android/app/src/main/java/.../CastOptionsProvider.kt` — **new**: implements `OptionsProvider`, sets receiver app ID `F007D354`
- `android/app/src/main/java/.../CastPlugin.kt` — **new**: Capacitor plugin with `initialize()`, `showPicker()`, `castMedia()`, `stopCasting()`, `getState()`; events: `castStateChanged`, `sessionStarted`, `sessionEnded`
- `src/plugins/CastPlugin.ts` — **new**: TypeScript interface for `Cast` plugin
- `src/pages/ItemDetailsPage.vue` — Cast button added to actions row (shows only when `castState !== 'NO_DEVICES_AVAILABLE'`); Cast init + castItem logic added

**Cast flow:**
1. ItemDetailsPage mounts → `CastPlugin.initialize()` → polls cast state
2. If Cast devices available: Tv2 icon appears
3. Tap → if connected, `castMedia()` directly; else `showPicker()` → user selects device → `sessionStarted` event → `castMedia()` automatically
4. Jellyfin receiver handles auth + stream

---

## Feature 5: Quick Connect ✅

Login without password via a 6-digit code approved from another Jellyfin client.

**Files changed:**
- `src/store/jellyfin-store.ts` — added `quickConnectInitiate()`, `quickConnectPoll()`, `quickConnectAuthenticate()` using raw `fetch` (Quick Connect not in SDK wrappers)
- `src/pages/LoginPage.vue` — Quick Connect section below the standard form; shows 6-digit code as individual character boxes; polls every 2s; auto-cancels after 5 min; graceful error if server has Quick Connect disabled

**Quick Connect flow:**
1. User enters server URL → taps "Use Quick Connect"
2. App calls `POST /QuickConnect/Initiate` → shows 6-digit code
3. Polls `GET /QuickConnect/Connect?Secret=...` every 2s
4. When `Authenticated: true`: calls `POST /Users/AuthenticateWithQuickConnect` → logs in, saves server, navigates to libraries

---

## Build Status

`npm run build:skip-types` ✅ — builds successfully, no new errors. Pre-existing TS errors in LogViewerPage and older store methods unchanged.

---

## What's Left / Next Steps

- Add `tabindex="0"` to poster cards in MediaList, LibraryItemsPage, SearchPage for full D-pad grid navigation
- Test Chromecast on a real device with a Chromecast on the network
- Test Quick Connect with a Jellyfin server that has it enabled
- Add Cast button to PlayerPage (currently only in ItemDetailsPage)
- `removeServer()` is in the store but no UI to remove saved servers yet — could add swipe-to-delete in the saved servers list on LoginPage
