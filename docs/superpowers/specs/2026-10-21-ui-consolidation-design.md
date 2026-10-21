# Vela UI consolidation — design

Date: 2026-10-21 · Status: draft, awaiting user approval

## Intent

Vela (formerly "Jellyfin V4lgrind") is heading for a public release. Its UI works but does not
look like a single app: every screen lays itself out and styles its controls its own way, the
text mixes French and English, and some controls are hard to use with a finger. The goal is to
**consolidate** the design: same layout, same components, same text, on phone and tablet.
This is not a redesign — the "Direction OLED" palette (black background, blue accent `#2f9bff`,
redesign #23, `design-mockups/`) stays as is.

The user's words: "consolidate the design and have something consistent", "not very mobile
friendly", "a consistent look everywhere across all components".

## What was observed (tablet audit, 2026-10-21, OnePlus Pad in landscape)

Screenshots of 10 screens (home, libraries, series list, series page, season, search,
downloads, settings, music, album). Problems:

1. **Layout**: on the detail pages the title sits at the left edge (16 px), the action buttons
   at ~110 px, and the sections (Seasons, Cast, Tracks) in a card centered at ~710 px wide.
   Settings = narrow centered column; Downloads = centered title; Home = full width.
2. **Touch**: A–Z index with ~10 px letters (LibraryItemsPage); ← → arrows on the carousels
   (desktop pattern); back button with no background on Andor (unreadable on a light image).
3. **Navigation**: `BottomNav` lights up "Accueil" on every `ItemDetails`/`PersonDetail`,
   even when opened from Biblio (hardcoded `match`). The floating bar covers the end of the content.
4. **Language**: FR/EN mix ("Continue Watching", "Filters", "Show more", "Downloads",
   "Settings" vs "Accueil", "Biblio.", "Réglages"); leftover "APPEARANCE · NEW" badge.
5. **Details**: library tile titles in another font; emoji 📪 in the Downloads empty
   state; season backdrop pixelated (poster upscaled); "2022 · 12 episodes · 2022" (duplicated
   year); tabs (Albums/Artists) and filter chips look identical.

Stats: 80 hand-built `<button>` vs 35 `<Button>`; only 11 components in `src/components/ui/`
(badge, button, card, checkbox, dialog, input, label, separator, skeleton, slider, toast).

## Goals

- **One page layout** shared by every screen: same side gutters, same header (title + back +
  actions), same width and alignment for sections.
- **Every interactive control comes from `src/components/ui/`**: no more hand-built button,
  chip, tab, toggle or list row in the pages.
- **Touch-first**: targets ≥ 44×44 px, horizontal lists scroll with a swipe (no arrows),
  usable A–Z index, back button always readable.
- **Adaptive navigation**: bottom bar on phone and tablet in portrait; **vertical rail on the
  left** once the window is wide (tablet in landscape). The active tab reflects the section
  you came from.
- **Bilingual FR/EN**: all text goes through translation files; the app follows the device
  language (French if the system is French, English otherwise).
- **Visual fixes** from section 5 of the audit.

## Non-goals

- Changing palette or brand (Vela + Direction OLED stay).
- Restyling the **native Kotlin players** (video `NativePlayerActivity`, music `MusicService`,
  Android Auto) — out of scope. **Their text, however, is in scope** (see step 7).
- Adding features or changing the app's behavior.
- A manual language picker in Settings (device language only for now).
- Translating Jellyfin content (titles, synopses, genres come from the server).

## Anti-goals (failure even if it "works")

- A screen that ends up looking like it comes from another app (generic look, Material/Ionic).
- A regression on an existing behavior (offline mode, downloads, Android Auto, Cast/AirPlay,
  resume playback).
- Components written from scratch where shadcn-vue offers one (see constraints).
- Text left hardcoded in a page after migration.

## Constraints

- **Stack kept**: Vue 3 + Tailwind CSS v4 + **shadcn-vue** (Reka UI) + Lucide. No new
  CSS framework.
- **`wednesday-design` rule** (`.wednesday/skills/wednesday-design/SKILL.md`): never create a
  UI primitive from scratch. Order: (1) shadcn-vue component added via its CLI
  (`npx shadcn-vue@latest add <name>`), (2) composition of existing components,
  (3) style extension through tokens. Layout components (page, header, empty state) are
  compositions — allowed.
- **`wednesday-dev` rule**: import ordering, complexity ≤ 8, naming.
- **Tokens**: in `src/assets/main.css` (`@theme`). Existing names (`accent-purple` = blue, etc.)
  stay stable; additions go on top.
- **Android**: safe areas already handled (`--sab`, `env(safe-area-inset-*)`); keep them.
- **Verification on device**: tablet (OnePlus Pad, adb `-t` transport of the moment) and phone
  (Pixel 10), both connected over Wi-Fi adb. APK via Docker (`Dockerfile.android`, local
  versionCode < 1000).
- **Commits**: the user asks for direct commit + push to `main` after each validated step.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Framework | Keep Tailwind + shadcn-vue, finish the component set (user: "do what you recommend") |
| Languages | FR + EN, device language, fallback EN |
| Tablet in landscape | Vertical nav rail on the left ("very good idea") |
| Palette | Unchanged (Direction OLED) |
| Native Android text | Also bilingual FR/EN ("even in the native Android code I want the languages") |

## Calls made by Claude (to check)

- **i18n**: `vue-i18n` (Composition API), files `src/locales/fr.json` and `src/locales/en.json`,
  locale = `navigator.language` (the WebView follows the Android system language).
  Hierarchical keys per screen (`home.continueWatching`, `settings.theme.title`…).
- **Rail breakpoint**: window width ≥ 1024 px (Tailwind `lg`) → rail; below → bottom bar.
- **Active tab**: the detail screens (`ItemDetails`, `PersonDetail`, `Player`) inherit the tab
  of the last tab route visited (remembered in the router or a small composable), instead of a
  hardcoded `match`.
- **Spacing / type tokens** (to adjust visually in Step 1):
  - page gutter: 16 px phone, 24 px tablet; space between sections: 32 px;
  - type: page title 28/34 px bold, section title 17 px semibold, body 15 px,
    caption 13 px, label 11 px uppercase tracking;
  - radii: keep `--radius-card` 12 px / `--radius-button` 8 px; pills = full.
- **Width of the detail pages**: everything (title, actions, sections) aligned on the same
  gutter, max content width ~1200 px on tablet, no centered card narrower than the title.
- **Tabs vs filters**: tabs = `Tabs` component (underline or segment), filters = chips
  (`ToggleGroup`/outline badges) — two visually distinct styles.
- **A–Z index**: 44 px wide hit zone, letters ≥ 12 px, drag the finger along the index to
  scroll; hidden if the list has fewer than ~30 items (to fine-tune).
- **Carousels**: native horizontal scroll with scroll-snap (or shadcn-vue `Carousel` / Embla if
  snap isn't enough), arrows removed on touch.
- **Back button**: round, translucent background (`bg-black/40` + blur) on images.
- **Empty states**: Lucide icon instead of the emoji, shared component.
- **Season backdrop**: use the series backdrop (or blurred) instead of the upscaled poster;
  remove the duplicated year.
- **Durations and dates** ("17m left", "1h 13m left", years): formatted through `vue-i18n`
  (plurals) + `Intl`, not by hand.
- **Light theme**: the Auto/Light/Dark option stays; every new component must work in both
  themes (tokens `.light` in `main.css`).
- **Desktop (Electron)**: same rule as tablet — rail once the window is ≥ 1024 px.

## Components to add / build

Via the shadcn-vue CLI (then retouched with the tokens): `tabs`, `toggle-group`, `switch`,
`drawer` (bottom sheet, vaul-vue) or `sheet`, `dropdown-menu`, `scroll-area`,
`carousel` if needed.

Compositions (in `src/components/layout/` or `src/components/ui/`, builder's call):
- `AppPage`: gutters, safe areas, bottom padding (bar / mini player), max width.
- `PageHeader`: back (optional), title, subtitle, actions on the right; "on image" variant
  for detail pages.
- `Section`: section title + optional "see all" action + content aligned on the gutter.
- `MediaRail`: swipeable horizontal row of cards (posters/thumbnails/people).
- `ListRow`: Settings / tracks row (icon, label, value, chevron, ≥ 48 px high).
- `EmptyState`: Lucide icon, title, text, optional action.
- `AppNav`: bottom bar or rail depending on width (replaces `BottomNav.vue`).

## Migration (order)

1. **Foundations**: tokens, i18n (setup + empty FR/EN files), new shadcn-vue components,
   layout compositions, `AppNav` (bar + rail + correct active tab).
2. **Home** (`LibrariesPage`) and **Biblio.** (`MediaList`, `LibraryItemsPage`, A–Z index, tabs vs filters).
3. **Detail** (`ItemDetailsPage`, 1,254 lines: series, season, episode, movie, album, artist)
   and `PersonDetailPage`.
4. **Search**, **Downloads** (`OfflineLibraryPage`), **Settings**, **Login**, **Logs**.
5. **Shared components**: `MiniAudioPlayer`, `ExpandedAudioPlayer`, `TrackActionsMenu`,
   `PlayerBottomSheet`, `AirPlayDialog`, `TranscodeDownloadDialog`, toast.
6. **Web/desktop player** (`PlayerPage`): i18n + tokens only (not used on Android).
7. **Native Android text** (user decision): every user-visible string in Kotlin/XML
   (download notifications and their channel, native video player labels such as
   "Stream Info", Android Auto folders such as "Ajouts récents", user-visible error messages)
   moves to `res/values/strings.xml` (English, default) + `res/values-fr/strings.xml`. Android
   picks the system language on its own — same rule as the Vue side. Technical messages
   (`call.reject(...)` read only by the JS, logs) stay as they are.

Each step: the screen's text goes through i18n, its controls through `components/ui`, its
layout through `AppPage`/`PageHeader`/`Section`.

## Verification per step

- `npx vitest run` + `npm run build` green.
- APK installed on tablet and phone; adb screenshots of the migrated screens, in **tablet
  landscape**, **tablet portrait** and **phone portrait**, compared before/after.
- Checks: alignment on the gutter, targets ≥ 44 px, no remaining FR/EN mix (test both
  languages by switching the system language or forcing the locale in dev),
  correct active tab.
- The user validates on the tablet, then commit + push to `main`.

## Left to the builder

- The exact visual style of the tabs (underline vs segment) and of the rail, within the
  palette.
- The internal structure of the layout components and their exact location.
- Splitting `ItemDetailsPage` into sub-components if it helps the migration (behavior
  unchanged).
- Detailed i18n key naming.
- Fine-tuning the spacing tokens after the first screenshots.
