# 2026-11-19 — Impeccable init: PRODUCT.md

## What was done
- Ran `/impeccable init`. Wrote `PRODUCT.md` at the repo root (product truth only, no visual decisions).
- Confirmed with the user:
  - Users: built for the owner first (Pixel 10 + OnePlus Pad, home server, offline), public release later.
  - Positioning: smart native playback, offline as a first-class mode, music done well, calm/polished UI.
  - Targets: Android phone + tablet only. Electron and Android TV are side builds that just need to keep working.
- Platform recorded as `web`: Vue in a Capacitor WebView with its own design language, not Material.

## Not done / skipped
- No DESIGN.md (init doesn't write one).
- No image generation available → no `buildPath` recorded in `.impeccable/config.json`.
- Live mode not set up: the app needs a Jellyfin login to show real screens.

## Next
- `/impeccable document` to record the current design system (tokens, layout components, nav) in DESIGN.md.
- Note: CLAUDE.md says "Android only" while the README still advertises Windows/Linux; PRODUCT.md treats desktop as a side build.

## Same session — hooks + DESIGN.md
- `/impeccable hooks on`: enabled in `.impeccable/config.json`, but no hook is wired, because the launcher only looks in `~/.claude/skills` and not in the plugin cache. Fix: `npx impeccable install`, then `hooks on` again.
- `/impeccable document`: wrote `DESIGN.md` + `.impeccable/design.json` from `src/assets/main.css`, the ui/ and layout/ components and AppNav.
  User choices: North Star "The Night Sky"; mood premium/cinematic + calm; elevation "flat + floating chrome";
  accent named "Star Blue"; components "soft & touchable"; unused tokens (orange/teal/green/rating, --radius-*) recorded as legacy.
- Possible follow-up: remove the legacy tokens from main.css; rename `accent-purple` → `accent` (cosmetic).
