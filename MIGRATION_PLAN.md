# Plan: Migrate UI to shadcn-vue + Tailwind CSS

## Context

The Jellyfin media client (Vue 3 + Vite + Capacitor) currently uses hand-written scoped CSS in every component with no CSS framework or UI library. The goal is to modernize the look-and-feel using **shadcn-vue** for components and **Tailwind CSS v4** for styling, with a **purple-accented dark theme** (shadcn's default dark mode with purple as the primary color). All UI text will be **translated from French to English**. Mobile-first responsiveness and all business logic stay untouched.

---

## Phase 0: File Structure Reorganization

Currently, page components sit directly in `src/` with no folder structure. Reorganize into:

```
src/
├── App.vue
├── main.ts
├── assets/
│   └── main.css              ← new (Tailwind entry)
├── pages/                     ← new folder
│   ├── LoginPage.vue          ← moved from src/
│   ├── MediaList.vue          ← moved from src/
│   ├── LibraryItemsPage.vue   ← moved from src/
│   ├── ItemDetailsPage.vue    ← moved from src/
│   ├── PlayerPage.vue         ← moved from src/
│   └── OfflineLibraryPage.vue ← moved from src/
├── components/
│   ├── SearchBar.vue          ← moved from src/
│   ├── MiniAudioPlayer.vue    ← already here
│   ├── ExpandedAudioPlayer.vue← already here
│   ├── LazyImg.vue            ← already here
│   └── ui/                    ← new (shadcn components)
├── lib/
│   └── utils.ts               ← new (shadcn cn() helper)
├── composables/               ← unchanged
├── services/                  ← unchanged
├── store/                     ← unchanged
├── utils/                     ← unchanged
└── router/                    ← unchanged
```

**Files to update after moves:**
- **[src/router/index.ts](src/router/index.ts)**: Update all page component imports to `@/pages/...`
- **[src/App.vue](src/App.vue)**: Update `SearchBar` import to `@/components/SearchBar`

---

## Phase 1: Setup & Configuration

### 1.1 Add `@/` path alias (required by shadcn-vue)

- **[tsconfig.json](tsconfig.json)**: Add `baseUrl` and `paths` to `compilerOptions`
- **[vite.config.ts](vite.config.ts)**: Add `resolve.alias` for `@` → `src/`

### 1.2 Install Tailwind CSS v4

```bash
npm install -D tailwindcss @tailwindcss/vite
```

- **[vite.config.ts](vite.config.ts)**: Add `tailwindcss()` to plugins
- **Create [src/assets/main.css](src/assets/main.css)**: Tailwind v4 entry point with:
  - `@import "tailwindcss"`
  - `@theme` block with custom color tokens
  - `@utility` definitions for safe-area insets and player-specific gradients
  - `@layer base` for global `html/body/#app` styles
  - shadcn-vue HSL CSS variables — **purple primary** (`hsl(262, 83%, 58%)` / `#7c3aed`), dark backgrounds, neutral grays for surfaces
- **[src/main.ts](src/main.ts)**: Import `./assets/main.css`

### 1.3 Install shadcn-vue + dependencies

```bash
npm install radix-vue class-variance-authority clsx tailwind-merge lucide-vue-next
npx shadcn-vue@latest init
```

### 1.4 Add shadcn-vue components

```bash
npx shadcn-vue@latest add button card input label badge progress slider skeleton dropdown-menu sheet checkbox separator scroll-area tooltip alert
```

Creates `src/components/ui/` with all component directories and `src/lib/utils.ts` with `cn()` helper.

---

## Phase 2: Icon Strategy

Replace all inline `<svg>` elements with **lucide-vue-next** icons across all components. Key mappings:

| Inline SVG | Lucide Icon |
|---|---|
| Play triangle | `Play` |
| Pause bars | `Pause` |
| Back arrow | `ArrowLeft` |
| Volume (high/low/mute) | `Volume2` / `Volume1` / `VolumeX` |
| Skip prev/next | `SkipBack` / `SkipForward` |
| Audio tracks | `AudioLines` |
| Subtitles | `Subtitles` |
| Chevron down | `ChevronDown` |
| Queue/playlist | `ListMusic` |
| Loading spinner | `Loader2` with `animate-spin` |

---

## Phase 3: Component Migration (smallest → largest)

For each component: replace the `<template>` markup with Tailwind classes + shadcn-vue components, then delete the entire `<style scoped>` block. **No changes to `<script setup>` logic.**

### 2.1 [src/components/LazyImg.vue](src/components/LazyImg.vue) (73 lines)
- Replace CSS opacity transition with Tailwind `opacity-0 transition-opacity duration-300`

### 3.2 [src/pages/LoginPage.vue](src/pages/LoginPage.vue) (125 lines)
- Use: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Input`, `Label`, `Button`, `Checkbox`, `Alert`
- Centered card layout with `grid h-dvh place-items-center`

### 3.3 [src/components/MiniAudioPlayer.vue](src/components/MiniAudioPlayer.vue) (161 lines)
- Use: `Progress`, `Button` (ghost/icon)
- Fixed bottom bar with `fixed bottom-0 inset-x-0 h-16`

### 3.4 [src/pages/MediaList.vue](src/pages/MediaList.vue) (194 lines)
- Use: `Card`, `Skeleton`, `Alert`
- Responsive grid with `grid-cols-[repeat(auto-fill,minmax(140px,1fr))]` + breakpoint variants

### 3.5 [src/pages/LibraryItemsPage.vue](src/pages/LibraryItemsPage.vue) (286 lines)
- Use: `Card`, `Button`, `Badge`, `Skeleton`
- Pagination controls with `Button` variants

### 3.6 [src/components/ExpandedAudioPlayer.vue](src/components/ExpandedAudioPlayer.vue) (419 lines)
- Use: `Slider` (volume), `Button` (ghost/icon), `ScrollArea` (queue)
- Full-screen overlay with radial gradient background

### 3.7 [src/pages/OfflineLibraryPage.vue](src/pages/OfflineLibraryPage.vue) (426 lines)
- Use: `Card`, `Button`, `Badge`, `Separator`, `Skeleton`
- Stats section + grouped content sections

### 3.8 [src/components/SearchBar.vue](src/components/SearchBar.vue) (529 lines)
- Use: `Button`, `Badge`, `Input`
- Keep custom autocomplete logic (keyboard nav + grouped results) — only replace CSS with Tailwind
- Navbar with `flex items-center gap-3` layout

### 3.9 [src/App.vue](src/App.vue) (143 lines)
- Extract global styles to `main.css`
- Offline banner with Tailwind gradient + `Loader2` icon
- Remove `<style>` block (both scoped and global)

### 3.10 [src/pages/ItemDetailsPage.vue](src/pages/ItemDetailsPage.vue) (998 lines)
- Use: `Card`, `Badge`, `Button`, `Progress`, `Separator`, `ScrollArea`, `Skeleton`, `Alert`
- Two-column responsive layout: `grid grid-cols-[300px_1fr] max-md:grid-cols-1`
- Metadata chips → `Badge variant="secondary"`
- Cast horizontal scroller → `ScrollArea`

### 3.11 [src/pages/PlayerPage.vue](src/pages/PlayerPage.vue) (1589 lines)
- Use: `Slider` (volume), `Button` (ghost/icon), `Badge` (quality indicator)
- Keep custom dropdown menus (tightly coupled to controls-visibility timer)
- Keep custom progress/seek bar (custom hover-expand + click-to-seek)
- Replace all inline SVGs with lucide icons
- Controls overlay: gradient background with opacity transition

---

## What stays untouched

- All `<script setup>` business logic in every component
- Pinia stores ([src/store/](src/store/))
- Services ([src/services/](src/services/))
- Router ([src/router/index.ts](src/router/index.ts))
- Utils/composables ([src/utils/](src/utils/), [src/composables/](src/composables/))
- Constants ([src/constants.ts](src/constants.ts))
- Shaka Player integration
- Capacitor config & Android native code

**Note:** All French UI text (buttons, labels, headings, placeholders, error messages) will be translated to English during the migration of each component.

---

## New files created

| File | Purpose |
|---|---|
| `src/assets/main.css` | Tailwind v4 entry point, theme tokens, safe-area utilities, base styles, shadcn CSS vars |
| `src/lib/utils.ts` | `cn()` helper (shadcn-vue init) |
| `src/components/ui/*` | ~15 shadcn-vue component directories |
| `components.json` | shadcn-vue configuration |

---

## Verification

1. **`npm run dev`** — confirm app loads, all pages render correctly
2. **Walk through each page**: Login → Libraries → Library Items → Item Details → Player → Offline
3. **Test audio player**: mini player at bottom, expand to full screen, queue, volume slider
4. **Test video player**: play/pause, seek, audio/subtitle dropdowns, volume, back button
5. **Test search**: type query, verify grouped results, keyboard navigation, click to navigate
6. **Test offline**: download an item, verify badge counts, offline page, delete
7. **Test responsive**: resize browser from mobile to desktop widths
8. **`npm run build`** — confirm production build succeeds with no errors
