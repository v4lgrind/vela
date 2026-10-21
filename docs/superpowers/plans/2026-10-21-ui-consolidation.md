# Vela UI consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Vela screen shares one layout, one component set, FR/EN text and touch-first controls, with a side rail on wide screens.

**Architecture:** Foundations first (i18n, tokens, shadcn-vue components, layout compositions, adaptive nav), then screens migrate one group at a time onto those foundations, then native Android strings. Pure logic (locale resolution, nav section, formatting, A–Z mapping, detail meta) lives in small tested TS modules; Vue components stay thin.

**Tech Stack:** Vue 3, Tailwind CSS v4, shadcn-vue (Reka UI), Lucide, vue-i18n, Vitest + @vue/test-utils (jsdom), Capacitor 8 Android, Kotlin.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-consolidation-design.md`

## Global Constraints

- Keep Tailwind CSS v4 + shadcn-vue (Reka UI) + Lucide; no other CSS/UI framework.
- Never create a UI primitive from scratch: add it with `npx shadcn-vue@latest add <name>`, compose existing ones, or extend styles via tokens (`.wednesday/skills/wednesday-design/SKILL.md`).
- `wednesday-dev`: import ordering, cyclomatic complexity ≤ 8, naming conventions.
- Palette unchanged (Direction OLED); existing token names in `src/assets/main.css` stay stable (`accent-purple` = blue `#2f9bff`); add, don't rename.
- Both themes (Auto/Light/Dark, `.light` class) must stay legible for every new component.
- Languages: FR + EN; locale = device language (`fr*` → `fr`, anything else → `en`); fallback `en`. No language picker.
- Jellyfin content (titles, overviews, genres) is not translated.
- Touch targets ≥ 44×44 px; list rows ≥ 48 px high.
- Wide layout (side rail) when window width ≥ 1024 px; bottom bar below.
- Page gutter 16 px phone / 24 px (≥ 768 px); 32 px between sections; page title 28 px (34 px ≥ 1024) bold; section title 17 px semibold; body 15 px; caption 13 px; label 11 px uppercase tracking; radii `--radius-card` 12 px, `--radius-button` 8 px, pills full.
- Native Kotlin player UI is not restyled; only its user-visible text moves to Android string resources.
- Keep safe-area handling (`--sab`, `env(safe-area-inset-*)`).
- Route ↔ page map: `libraries` = `MediaList.vue` (Accueil/Home), `libraryList` = `LibrariesPage.vue` (Biblio.), `libraryItem` = `LibraryItemsPage.vue`, `offline` = `OfflineLibraryPage.vue`.
- After each **Step** (group of tasks) is validated by the user on the tablet: commit + push to `main` (user's standing request). Commit locally per task.

## Review Focus

1. Device language that is neither plain `fr` nor `en` (`fr-CA`, `de-DE`, empty) → `fr-CA` gives French, others English, never a missing-key crash. (Task 1 test.)
2. Rotating the tablet while the app is open → nav switches bar ↔ rail live, content padding follows, route and scroll kept. (Task 5 test on the media-query composable.)
3. App opened or resumed directly on a detail page with no history (deep link, Android Auto, notification) → back goes to Home, the Home tab is active. (Task 5 test.)
4. Very long titles on a phone ("Astérix & Obélix : Le Combat des Chefs") → header title wraps to 2 lines max and never pushes action buttons off screen. (Task 4 test.)
5. Light theme after migration → every new component readable (no white-on-white, no black-on-black). (Verification steps in Tasks 5 and 13 take light-theme screenshots.)

## Device verification (used by every task marked "Verify on device")

```bash
docker build -f Dockerfile.android --target apk --build-arg ANDROID_VERSION_CODE=<next, < 1000> --output type=local,dest=./out .
adb devices -l                       # tablet = OPD2304, phone = Pixel_10; note transport ids
adb -t <id> install -r out/vela.apk
adb -t <id> exec-out screencap -p > <scratchpad>/<screen>.png
```
Screens to capture: tablet landscape, tablet portrait (`adb shell settings put system user_rotation 0/1` with `accelerometer_rotation 0`, restore afterwards), phone portrait. Pass = content aligned on the gutter, targets ≥ 44 px, no FR/EN mix, correct active tab.

---

## Step 1 — Foundations

### Task 1: i18n setup and locale-aware formatting

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/format.ts`, `src/locales/en.json`, `src/locales/fr.json`
- Create: `src/i18n/index.test.ts`, `src/i18n/format.test.ts`
- Modify: `src/main.ts` (install plugin), `src/utils/helpers.ts` (`typeLabel`, `formatBytes`, `formatTicksHuman` use i18n), `src/utils/helpers.test.ts`
- Modify: `package.json` (add `vue-i18n` v11)

**Interfaces:**
- Produces: `resolveLocale(lang: string | undefined): 'fr' | 'en'`; `i18n` (vue-i18n instance, `legacy: false`, `fallbackLocale: 'en'`); `setLocale(l: 'fr'|'en'): void`; `formatDuration(seconds: number): string` ("1h 13m" / "1 h 13 min"); `formatRemaining(seconds: number): string` ("1h 13m left" / "Reste 1 h 13 min"); `formatBytes` keeps its signature, unit labels from i18n (`B/KB/MB/GB/TB` vs `o/Ko/Mo/Go/To`). Components use `useI18n().t`; non-component code uses `i18n.global.t`.
- Key layout: top-level namespaces `common`, `nav`, `home`, `library`, `detail`, `search`, `downloads`, `settings`, `login`, `logs`, `player`, `audio`, `types`.

- [ ] **Step 1: Write failing tests**

```ts
// src/i18n/index.test.ts
it('maps device languages', () => {
  expect(resolveLocale('fr-FR')).toBe('fr');
  expect(resolveLocale('fr-CA')).toBe('fr');
  expect(resolveLocale('en-US')).toBe('en');
  expect(resolveLocale('de-DE')).toBe('en');
  expect(resolveLocale('')).toBe('en');
  expect(resolveLocale(undefined)).toBe('en');
});
it('fr and en define exactly the same keys', () => {
  expect(flattenKeys(fr).sort()).toEqual(flattenKeys(en).sort());
}); // flattenKeys: local helper in the test file
// src/i18n/format.test.ts
it('formats durations per locale', () => {
  setLocale('en'); expect(formatDuration(4380)).toBe('1h 13m'); expect(formatRemaining(1020)).toBe('17m left');
  setLocale('fr'); expect(formatDuration(4380)).toBe('1 h 13 min'); expect(formatRemaining(1020)).toBe('Reste 17 min');
});
```
Update `helpers.test.ts` expectations for `typeLabel('Movie')` → `'Movie'` (en) / `'Film'` (fr).

- [ ] **Step 2:** `npx vitest run src/i18n src/utils/helpers.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** `npm i vue-i18n@^11`; implement the modules; `main.ts`: `app.use(i18n)` with `resolveLocale(navigator.language)`.
- [ ] **Step 4:** Same command → PASS; `npx vitest run` all green.
- [ ] **Step 5:** Commit `feat(i18n): vue-i18n with device-language FR/EN`.

### Task 2: Design tokens and touch-size primitives

**Files:**
- Modify: `src/assets/main.css` (`@theme` additions), `src/components/ui/button/index.ts`, `src/components/ui/badge/*` if sizes < 44 px when interactive

**Interfaces:**
- Produces Tailwind utilities from tokens: `--spacing-gutter` (16 px) / `--spacing-gutter-wide` (24 px), `--spacing-section` (32 px); text sizes `text-page` (28 px), `text-page-wide` (34 px), `text-section` (17 px), `text-body` (15 px), `text-caption` (13 px), `text-label` (11 px). Button sizes: `default` → `h-11`, `icon` → `size-11`, `sm` → `h-10` (sm only for non-primary inline actions), remove `hover:-translate-y-0.5` (desktop-only affordance).

- [ ] **Step 1:** Add tokens; adjust `buttonVariants`.
- [ ] **Step 2:** `npm run build` → success; `npx vitest run` → green.
- [ ] **Step 3:** Commit `feat(ui): spacing/type tokens and 44px button sizes`.

### Task 3: Add missing shadcn-vue components

**Files:**
- Create (CLI): `src/components/ui/{tabs,toggle-group,switch,drawer,dropdown-menu,scroll-area}/*`
- Modify: `package.json` (vaul-vue etc. pulled by the CLI)

- [ ] **Step 1:** `npx shadcn-vue@latest add tabs toggle-group switch drawer dropdown-menu scroll-area` (answer prompts to keep existing files).
- [ ] **Step 2:** Restyle only via tokens: Tabs = underline style (active `text-text-heading` + 2 px `accent-purple` bar), TabsTrigger min height 44 px; ToggleGroup items = outline pills, min height 36 px with 44 px hit area (padding); Switch track 52×32.
- [ ] **Step 3:** `npm run build` → success.
- [ ] **Step 4:** Commit `feat(ui): add tabs, toggle-group, switch, drawer, dropdown-menu, scroll-area`.

### Task 4: Layout compositions

**Files:**
- Create: `src/components/layout/{AppPage,PageHeader,Section,MediaRail,ListRow,EmptyState}.vue`, `src/components/layout/index.ts`
- Test: `src/components/layout/layout.test.ts`

**Interfaces (props / slots):**
- `AppPage` — props `{ width?: 'full' | 'content' }` (`content` = max-w 1200 px centered); applies gutter (16/24 px) and top safe area; default slot.
- `PageHeader` — props `{ title: string; subtitle?: string; back?: boolean; overImage?: boolean }`; slot `actions`; emits nothing — back calls `router.back()` when `window.history.state?.back` exists, else `router.replace({ name: 'libraries' })`. Back button: `Button` size `icon`, `aria-label` = `t('common.back')`; `overImage` → round `bg-black/40 backdrop-blur`. Title `line-clamp-2`.
- `Section` — props `{ title: string; to?: RouteLocationRaw }` (shows "See all" link `t('common.seeAll')`); default slot.
- `MediaRail` — default slot; horizontal `overflow-x-auto snap-x snap-mandatory`, children `snap-start`, negative gutter margin so the first card aligns with the gutter, scrollbar hidden; no arrow buttons.
- `ListRow` — props `{ label: string; value?: string; icon?: Component; to?: RouteLocationRaw; destructive?: boolean }`; emits `click`; min height 48 px; chevron when `to` or click listener.
- `EmptyState` — props `{ icon: Component; title: string; text?: string }`; slot `action`.

- [ ] **Step 1: Write failing tests** (mount with router + i18n stubs)
  - `PageHeader` with no history: clicking back calls `router.replace({ name: 'libraries' })`.
  - `PageHeader` title element has class `line-clamp-2`; actions slot renders inside a `shrink-0` container.
  - `ListRow` root has `min-h-12`; renders chevron when `to` is set.
  - `EmptyState` renders the given icon component and the `action` slot.
- [ ] **Step 2:** `npx vitest run src/components/layout` → FAIL.
- [ ] **Step 3:** Implement the six components with `Button`, `cn()`, tokens.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(layout): AppPage, PageHeader, Section, MediaRail, ListRow, EmptyState`.

### Task 5: Adaptive navigation (bottom bar / side rail) with correct active tab

**Files:**
- Create: `src/components/AppNav.vue`, `src/composables/useWideLayout.ts`, `src/composables/useNavSection.ts`
- Test: `src/composables/useNavSection.test.ts`, `src/composables/useWideLayout.test.ts`
- Modify: `src/App.vue` (render `AppNav`, `routerViewStyle` uses rail padding-left when wide), `src/components/MiniAudioPlayer.vue` (offset left by rail width when wide), `src/composables/useBottomNav.ts` (rename export kept: `useBottomNavVisible` still returns nav visibility)
- Delete: `src/components/BottomNav.vue`

**Interfaces:**
- `type NavSection = 'home' | 'library' | 'search' | 'downloads' | 'settings'`
- `resolveNavSection(routeName: string | undefined, previous: NavSection | null): NavSection` — tab routes map directly (`libraries`→home, `libraryList`/`libraryItem`→library, `search`, `offline`→downloads, `settings`/`logs`→settings); detail routes (`ItemDetails`, `PersonDetail`, `Player`) return `previous ?? 'home'`.
- `useNavSection(): ComputedRef<NavSection>` — keeps `previous` updated from the router.
- `useWideLayout(): Ref<boolean>` — `matchMedia('(min-width: 1024px)')`, reactive to `change`.
- `AppNav` labels via `t('nav.home' | 'nav.library' | 'nav.search' | 'nav.downloads' | 'nav.settings')`; bar = current floating style, labels 11 px; rail = fixed left, width 88 px, full height, icons + labels, safe-area top/bottom.

- [ ] **Step 1: Write failing tests**
```ts
expect(resolveNavSection('ItemDetails', 'library')).toBe('library');
expect(resolveNavSection('ItemDetails', null)).toBe('home');
expect(resolveNavSection('PersonDetail', 'search')).toBe('search');
expect(resolveNavSection('libraryItem', 'home')).toBe('library');
expect(resolveNavSection('logs', null)).toBe('settings');
// useWideLayout: stub matchMedia, fire a 'change' with matches=true → ref becomes true, then false
```
- [ ] **Step 2:** `npx vitest run src/composables` → FAIL.
- [ ] **Step 3:** Implement; wire into `App.vue`; remove `BottomNav.vue`.
- [ ] **Step 4:** Tests PASS; `npm run build` success.
- [ ] **Step 5: Verify on device:** rail visible in tablet landscape, bar in tablet portrait and on phone; open a series from Biblio. → Biblio. active; rotate while on a list → no route change; the last row of a long list scrolls fully above the bar (and above the mini player when playing); one light-theme screenshot.
- [ ] **Step 6:** Commit `feat(nav): side rail on wide screens, active tab follows origin`.
- [ ] **Step 7:** Show screenshots to the user; on approval `git push origin main`.

## Step 2 — Home and Library

### Task 6: Home (`MediaList.vue`)

**Files:** Modify `src/pages/MediaList.vue`; add keys under `home.*` in both locale files.
**Interfaces:** Consumes `AppPage`, `PageHeader` (title `t('home.title')`, actions = existing AirPlay/Cast/refresh as `Button size="icon"` with `aria-label`), `Section`, `MediaRail`, `formatRemaining`.

- [ ] **Step 1:** Replace page shell and the three rows ("Continue Watching", "Next Up", "Recently Added · <library>") with `Section` + `MediaRail`; `remainingTime(item) left` → `formatRemaining(seconds)`; all literals → `t()`.
- [ ] **Step 2:** Cards without a `Primary` image use the same card frame with the title centered (no bare logo floating outside the grid).
- [ ] **Step 3:** `npx vitest run` + `npm run build` green.
- [ ] **Step 4: Verify on device** (3 screenshots).
- [ ] **Step 5:** Commit `feat(home): shared layout, rails, i18n`.

### Task 7: Library list (`LibrariesPage.vue`)

**Files:** Modify `src/pages/LibrariesPage.vue`; keys `library.*`.
- [ ] **Step 1:** `AppPage` + `PageHeader` (`t('library.title')`); tile titles use `font-sans` bold `text-section`-scale (the off-font is a stray `font-family`/class — remove it); tiles in a 2-col (phone) / 4-col (≥ 1024) grid with `gap-3`.
- [ ] **Step 2:** Build green; **Verify on device**.
- [ ] **Step 3:** Commit `feat(library): consistent tiles and header`.

### Task 8: Library items (`LibraryItemsPage.vue`) — tabs, filters, A–Z index

**Files:**
- Create: `src/components/AlphaIndex.vue`, `src/utils/alphaIndex.ts`, `src/utils/alphaIndex.test.ts`
- Modify: `src/pages/LibraryItemsPage.vue` (lines ~220-240 index, ~404-420 `alphabet`/`jumpToLetter`); keys `library.*`

**Interfaces:**
- `letterAt(offsetY: number, height: number, letters: readonly string[]): string` — clamps to first/last letter.
- `AlphaIndex` props `{ letters: readonly string[] }`, emits `select(letter: string)`; 44 px wide hit strip, letters ≥ 12 px, `pointerdown`+`pointermove` select continuously; hidden by the page when the item count < 30.
- Music library: type switch (Albums/Artists/Songs/Playlists) = `Tabs`; filters (Filters/Unwatched/Favorites) = `ToggleGroup` chips; count label `t('library.shown', { n })`.

- [ ] **Step 1: Failing test**
```ts
const L = ['#', 'A', 'B', 'C'];
expect(letterAt(0, 400, L)).toBe('#');
expect(letterAt(399, 400, L)).toBe('C');
expect(letterAt(150, 400, L)).toBe('A');
expect(letterAt(-20, 400, L)).toBe('#');
expect(letterAt(900, 400, L)).toBe('C');
```
- [ ] **Step 2:** `npx vitest run src/utils/alphaIndex.test.ts` → FAIL; implement → PASS.
- [ ] **Step 3:** Migrate the page (AppPage, PageHeader with back, Tabs, ToggleGroup, AlphaIndex, i18n).
- [ ] **Step 4:** Build green; **Verify on device** (drag on the index scrolls the grid on phone).
- [ ] **Step 5:** Commit `feat(library-items): tabs vs filter chips, touch A–Z index, i18n`.
- [ ] **Step 6:** User validates Step 2 → `git push origin main`.

## Step 3 — Detail pages

### Task 9: Detail header, actions and meta (`ItemDetailsPage.vue`)

**Files:**
- Create: `src/utils/detailMeta.ts`, `src/utils/detailMeta.test.ts`, `src/components/detail/DetailHero.vue`
- Modify: `src/pages/ItemDetailsPage.vue` (hero/back at ~line 44, actions, overview); keys `detail.*`

**Interfaces:**
- `metaParts(item: BaseItemDto, t: (k: string, p?: object) => string): string[]` — year (once), episode count (`t('detail.episodes', { n })`) or runtime (`formatDuration`), community rating; never two identical entries.
- `heroImage(item: BaseItemDto): { itemId: string; type: 'Backdrop' | 'Primary' }` — Season/Episode → series `Backdrop` when `ParentBackdropItemId`/`SeriesId` has one; else own Backdrop; else Primary.
- `DetailHero` props `{ item: BaseItemDto }`, slot `actions`; uses `PageHeader` `overImage back`; title, meta and actions all start on the page gutter.

- [ ] **Step 1: Failing tests**
```ts
expect(metaParts({ Type: 'Season', ProductionYear: 2022, PremiereDate: '2022-09-21', ChildCount: 12 } as any, t)).toEqual(['2022', '12 episodes']);
expect(heroImage({ Type: 'Season', Id: 's1', SeriesId: 'x', ParentBackdropItemId: 'x' } as any)).toEqual({ itemId: 'x', type: 'Backdrop' });
expect(heroImage({ Type: 'Movie', Id: 'm', BackdropImageTags: [] } as any)).toEqual({ itemId: 'm', type: 'Primary' });
```
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Use `DetailHero` for series, season, episode, movie, album, artist; buttons (Download/Watched/Play album/shuffle/more) = `Button` with `t()` labels; "Show more" → `t('detail.showMore')`.
- [ ] **Step 4:** Build green; **Verify on device** (Andor, Andor S1, a movie, an album).
- [ ] **Step 5:** Commit `feat(detail): aligned hero, readable back button, meta without duplicates`.

### Task 10: Detail sections (`ItemDetailsPage.vue`) and `PersonDetailPage.vue`

**Files:** Modify `src/pages/ItemDetailsPage.vue` (seasons, episodes, cast, similar, tracks; arrows at ~412-461), `src/pages/PersonDetailPage.vue`; keys `detail.*`.
- [ ] **Step 1:** Each block → `Section` aligned on the gutter (no narrower centered card); Cast / More like this / Seasons → `MediaRail` (delete the `ArrowLeft/ArrowRight` buttons and their scroll handlers); tracks and episodes → rows ≥ 48 px with the track menu as `DropdownMenu`.
- [ ] **Step 2:** `PersonDetailPage` → `AppPage` + `PageHeader back` + `Section` + `MediaRail`.
- [ ] **Step 3:** If `ItemDetailsPage.vue` stays > ~900 lines, extract `src/components/detail/{EpisodeList,TrackList}.vue` (behavior unchanged).
- [ ] **Step 4:** `npx vitest run` + build green; **Verify on device**.
- [ ] **Step 5:** Commit `feat(detail): sections and swipe rails, person page`.
- [ ] **Step 6:** User validates Step 3 → `git push origin main`.

## Step 4 — Other screens

### Task 11: Search (`SearchPage.vue`)
- [ ] **Step 1:** `AppPage`; type filters → `ToggleGroup` (single); placeholder, "Cancel", empty text, counts → `t('search.*')`; result grid columns match the library grid.
- [ ] **Step 2:** Build green; **Verify on device**; commit `feat(search): shared filters and i18n`.

### Task 12: Downloads (`OfflineLibraryPage.vue`)
- [ ] **Step 1:** `AppPage` + `PageHeader` (left-aligned title `t('downloads.title')`); empty state → `EmptyState` with Lucide `Download` icon (remove 📪); sub-views use `PageHeader back`.
- [ ] **Step 2:** Build green; **Verify on device** (empty + one downloaded item); commit `feat(downloads): empty state and header`.

### Task 13: Settings (`SettingsPage.vue`)
- [ ] **Step 1:** `AppPage width="content"`; rows → `ListRow`; theme selector → `ToggleGroup` (Auto/Light/Dark); force-offline toggle → `Switch`; remove the "NEW" badge; sign-out row `destructive`; all text `t('settings.*')`.
- [ ] **Step 2:** Build green; **Verify on device** in dark **and** light theme; commit `feat(settings): list rows, switch, i18n`.

### Task 14: Login and Logs
- [ ] **Step 1:** `LoginPage.vue`: title "Vela" stays literal (brand); labels/placeholders/buttons/quick-connect text → `t('login.*')`; inputs height ≥ 44 px. `LogViewerPage.vue`: `PageHeader back`, `t('logs.*')`.
- [ ] **Step 2:** Build green; **Verify on device** (log out on the tablet only if the user agrees; otherwise check in `npm run dev`); commit `feat(login,logs): i18n and shared header`.
- [ ] **Step 3:** User validates Step 4 → `git push origin main`.

## Step 5 — Shared components

### Task 15: Audio UI, sheets and dialogs
**Files:** `src/components/{MiniAudioPlayer,ExpandedAudioPlayer,TrackActionsMenu,PlayerBottomSheet,AirPlayDialog,TranscodeDownloadDialog}.vue`, `src/components/ui/toast/AppToast.vue`; keys `audio.*`, `player.*`, `common.*`.
- [ ] **Step 1:** All text → `t()`; `TrackActionsMenu` → `DropdownMenu`; `PlayerBottomSheet` → `Drawer` if it is a hand-built sheet; dialog buttons → `Button`; icon buttons ≥ 44 px with `aria-label`.
- [ ] **Step 2:** `npx vitest run` (AppToast test updated if text changed) + build green; **Verify on device** (mini player, expanded player, track menu, AirPlay dialog); commit `feat(ui): shared components on ui kit and i18n`.

## Step 6 — Web/desktop player

### Task 16: `PlayerPage.vue` i18n and tokens
- [ ] **Step 1:** Text → `t('player.*')`; colors/radii via tokens; no layout redesign.
- [ ] **Step 2:** Build green; check in `npm run dev` (not used on Android); commit `feat(player-web): i18n`.
- [ ] **Step 3:** User validates Steps 5–6 → `git push origin main`.

## Step 7 — Native Android text

### Task 17: Android string resources FR/EN

**Files:**
- Modify: `android/app/src/main/res/values/strings.xml` (English defaults)
- Create: `android/app/src/main/res/values-fr/strings.xml`
- Modify: `DownloadService.kt` (notification titles at ~93, ~388, channel name/description ~339, user-facing failure text ~162 if shown in a notification), `JellyfinLibrary.kt` (Android Auto folder titles, e.g. "Ajouts récents" ~55, root title), `res/layout/*` (`android:text="Stream Info"` etc. → `@string/…`; pure symbols/numbers like `0:00:00`, `«`, `−10s` stay), `NativePlayerActivity.kt` and other Kotlin files only for strings shown to the user.
- Test: `src/i18n/androidStrings.test.ts`

**Interfaces:** string names in `snake_case`, prefixed by area: `download_*`, `auto_*`, `player_*`. `call.reject(...)` messages and logs are not user-visible → unchanged.

- [ ] **Step 1: Failing test** — reads both XML files with `fs` and asserts the set of `<string name>` in `values-fr` equals the set in `values` minus non-translatable ones (`app_name`, `package_name`, `custom_url_scheme`, `title_activity_main`), and that `values-fr` exists.
- [ ] **Step 2:** `npx vitest run src/i18n/androidStrings.test.ts` → FAIL; add resources and replace literals; → PASS.
- [ ] **Step 3:** `grep -rn 'android:text="[A-Za-z]' android/app/src/main/res/layout` → no output.
- [ ] **Step 4:** Docker APK build succeeds; **Verify on device**: start a download (notification text in system language), Android Auto folder names via DHU or car if available, native player info panel.
- [ ] **Step 5:** Commit `feat(android): FR/EN string resources for native UI`; user validates → `git push origin main`.

### Task 18: Close-out
- [ ] **Step 1:** `git grep -n -E ">[^<{]*[A-Za-zÀ-ÿ]{3,}[^<{]*<" -- 'src/**/*.vue'` reviewed by hand: remaining hits are brand ("Vela"), Jellyfin data or symbols only.
- [ ] **Step 2:** Switch the tablet system language to English, capture Home, Library, Detail, Settings; switch back to French.
- [ ] **Step 3:** Update `docs/session-progress/` with a summary; commit `docs: UI consolidation notes`; push.
