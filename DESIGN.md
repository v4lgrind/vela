---
name: Vela
description: A Jellyfin client for Android where the user's own media are the stars on a deep black sky.
colors:
  star-blue: "#2f9bff"
  star-blue-soft: "#5bb0ff"
  star-blue-day: "#1f6fe0"
  harbor-ink: "#04121f"
  void-black: "#000000"
  night-surface: "#121417"
  night-raised: "#1a1e23"
  night-hover: "#16191e"
  night-line: "#20242b"
  night-line-strong: "#2a2f37"
  night-input-line: "#232830"
  starlight: "#ffffff"
  moon-text: "#c7ced6"
  haze-text: "#9aa3ad"
  dust-text: "#6b7280"
  foreground-dark: "#e6eaee"
  alert-coral: "#ff6b6b"
  destructive-dark: "#7f1d1d"
  day-background: "#eef1f5"
  day-surface: "#ffffff"
  day-hover: "#e7ebf1"
  day-muted: "#f4f6f9"
  day-line: "#e3e6ea"
  day-heading: "#0b1220"
  day-text: "#46505e"
  day-muted-text: "#5a6573"
typography:
  headline:
    fontFamily: "Outfit Variable, Outfit, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  headline-wide:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.43
  caption:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Outfit Variable, Outfit, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  bar: "25px"
  full: "9999px"
spacing:
  rail-gap: "12px"
  gutter: "16px"
  gutter-wide: "24px"
  section: "32px"
  target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.star-blue}"
    textColor: "{colors.harbor-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.starlight}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-icon-round:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.starlight}"
    rounded: "{rounded.full}"
    size: "44px"
  input:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.foreground-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.night-hover}"
    textColor: "{colors.moon-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.star-blue}"
    textColor: "{colors.harbor-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  poster-card:
    backgroundColor: "{colors.night-raised}"
    rounded: "{rounded.xl}"
    width: "128px"
  nav-bar:
    textColor: "{colors.dust-text}"
    typography: "{typography.label}"
    rounded: "{rounded.bar}"
    height: "66px"
  nav-item-active:
    textColor: "{colors.star-blue}"
    typography: "{typography.label}"
  list-row:
    textColor: "{colors.starlight}"
    typography: "{typography.body}"
    padding: "8px 16px"
    height: "48px"
---

# Design System: Vela

## Overview

**Creative North Star: "The Night Sky"**

Vela's logo is a sail traced in stars on a deep night background, and the interface follows the same idea. The background is true black (#000000) so OLED screens switch off around the content. Surfaces are only a few steps lighter, like the darker parts of the sky. The bright things on screen are the user's own posters, backdrops and album covers. One blue, Star Blue, is the only colored light in the chrome. It marks where you are, what is selected and what is playing next.

The mood is **premium and cinematic, but calm**. Big blurred backdrops and full-bleed hero art give the detail and player screens a screening-room depth. Everything else stays quiet: two type weights doing most of the work, no ornament, no second accent. Density is comfortable rather than compact. Rails of posters swipe edge to edge, sections breathe 32px apart, and every control is at least 44px.

A day theme (`html.light`) mirrors the system on a cool grey-white field with a deeper Star Blue. It is fully supported, but the night theme is the reference: design there first, then confirm the day theme stays readable.

**Key Characteristics:**
- True-black canvas, tonal surfaces, media artwork as the only rich color.
- A single blue accent for state and action; text and icons on blue use Harbor Ink.
- One typeface (Outfit Variable): bold page titles, semibold section titles, regular body.
- Soft, rounded, touchable forms: pills for actions and chips, 12px corners for media.
- Content is flat; only the floating chrome (bottom bar, rail, mini player, sheets, dialogs) blurs and casts a shadow.

## Colors

A near-monochrome night palette with a single star-blue accent; the media artwork supplies all other color.

### Primary
- **Star Blue** (#2f9bff): the brand accent, taken from the logo's blue stars. Used for the active nav tab, selected chips and toggles, primary buttons, progress and "See all" links, focus rings and download badges. In the day theme it becomes **Star Blue Day** (#1f6fe0) for contrast on white.
- **Star Blue Soft** (#5bb0ff): the lighter tint for hover or secondary emphasis on accent-colored text and icons.
- **Harbor Ink** (#04121f): the logo's background navy. Used for text and icons placed on a Star Blue fill. In the day theme, text on blue is white.

### Neutral
- **Void Black** (#000000): the page background in the night theme. It is pure black on purpose so OLED pixels switch off.
- **Night Surface** (#121417): cards, popovers, sheets and dialogs.
- **Night Raised** (#1a1e23): poster placeholders, secondary buttons, raised tiles.
- **Night Hover** (#16191e): pressed and hover states, and the unselected chip fill.
- **Night Line** (#20242b) / **Night Line Strong** (#2a2f37) / **Night Input Line** (#232830): hairline borders, from resting to hovered, plus the input stroke.
- **Starlight** (#ffffff): headings and the strongest labels.
- **Foreground** (#e6eaee): the default foreground on Void Black.
- **Moon Text** (#c7ced6): body copy.
- **Haze Text** (#9aa3ad): secondary text, metadata, captions.
- **Dust Text** (#6b7280): inactive nav labels, chevrons, tertiary hints.
- **Alert Coral** (#ff6b6b): errors and destructive list rows. **Destructive** (#7f1d1d) fills destructive buttons.
- **Day theme:** Day Background (#eef1f5), Day Surface (#ffffff), Day Hover (#e7ebf1), Day Muted (#f4f6f9), Day Line (#e3e6ea), Day Heading (#0b1220), Day Text (#46505e), Day Muted Text (#5a6573).

### Named Rules
**The One Star Rule.** Star Blue is the only chromatic color in the interface chrome. Don't add a second accent. Color beyond the blue comes from the artwork only.

**The Ink-on-Blue Rule.** Anything placed on a Star Blue fill uses Harbor Ink (#04121f) in the night theme and white in the day theme, never mid-grey.

**The Legacy Tokens Note.** `main.css` still defines `accent-orange`, `accent-teal`, `accent-green`, `rating`, and `--radius-card/button/input`. They are unused leftovers, not part of the system. Don't adopt them; remove them when convenient. `accent-purple` is a historical name that now holds Star Blue.

## Typography

**Display Font:** Outfit Variable (with Outfit, -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** Outfit Variable (same stack)

**Character:** One geometric sans with soft, round letters across the whole app. Hierarchy comes from size and weight, never from a second family. The roundness matches the pill-shaped controls and the star-dot logo.

### Hierarchy
- **Headline** (700, 28px, 1.15; 34px at ≥ 1024px): page titles (`text-page` / `text-page-wide`). Clamped to two lines, or one line in compact headers (20px).
- **Title** (600, 17px, 1.3): section headings above rails and lists (`text-section`), empty-state titles.
- **Body** (400, 15px, 1.45): list rows, descriptions, settings labels (`text-body`). Overviews keep to about 65ch.
- **Control** (500, 14px): button and input text.
- **Caption** (400–500, 13px, 1.35): metadata lines, subtitles under page titles, "See all" links, chips (`text-caption`).
- **Label** (500, 11px, 1.3): nav-bar and rail labels, small badges (`text-label`).

### Named Rules
**The Scale-Token Rule.** Use the named type tokens (`text-page`, `text-section`, `text-body`, `text-caption`, `text-label`), not ad-hoc Tailwind sizes. `cn()` / tailwind-merge has been taught these names; raw `text-xl`/`text-sm` on headings is drift.

**The Three-Weight Rule.** Weights are 700 for page titles, 600 for section titles and emphasis, 500 for controls and labels, and 400 for reading text. Nothing lighter than 400 and nothing heavier than 700.

## Layout

- **Page frame:** `AppPage` adds a 16px side gutter on phones and 24px at ≥ 768px, plus top padding of the status-bar inset + 12px. Content pages can cap at 1200px centered.
- **Sections:** `Section` stacks with a 32px gap (`spacing-section`); the header row has the title on the left and an optional action or "See all" link (44px tall) on the right.
- **Media rails:** `MediaRail` bleeds out to the screen edges (`-mx-gutter`), keeps a 12px gap between cards and snaps each card to the gutter (`snap-x`, `scroll-px-gutter`). Rails swipe; they have no arrow buttons.
- **Grids:** library grids use 2:3 poster cells (128px wide in rails, 144px at ≥ 640px). Library tiles on Home are 16:9.
- **Navigation chrome:** on phones and portrait tablets, a floating bottom bar inset 12px from each side and floating 4px above the gesture inset. At ≥ 1024px (landscape tablet) it becomes a 72px left rail that starts below the status bar.
- **Safe areas:** always use `safe-pt / safe-pb / safe-pl / safe-pr` or `var(--sat|--sab|--sal|--sar)`. The native activity injects the measured insets; `env()` is only the fallback.
- **Edge-to-edge:** hero backdrops run under the status bar. Page content never does.

## Elevation & Depth

Depth comes from tone, not shadow. Content sits flat on Void Black, and cards and tiles separate by stepping up one surface tone (Night Surface → Night Raised). Detail and player screens add atmosphere with a blurred full-bleed backdrop that fades into the page background (`item-page-overlay`, `audio-player-bg`). Only the chrome that floats above content gets blur and a shadow.

### Shadow Vocabulary
- **Floating bar** (`box-shadow: 0 8px 30px -12px rgba(0,0,0,0.5)` + `backdrop-blur-xl` over `rgba(18,20,23,0.65)`): the bottom nav bar. The rail uses the same blur and fill, plus a right border instead of a shadow.
- **Sheet / mini player** (`box-shadow: 0 -8px 32px rgba(0,0,0,…)`): sheets and the mini audio player rising from the bottom.
- **Dialog** (`box-shadow: 0 20px 60px rgba(0,0,0,…)`): modal dialogs.
- **Over-image control** (`bg-black/40` + `backdrop-blur-md`, no shadow): back and action buttons placed on hero art.

### Named Rules
**The Floating Chrome Rule.** Only overlay chrome may cast a shadow or blur what's behind it: the nav bar, rail, mini player, sheets, dialogs, menus and controls over images. Cards, rows and sections stay flat and separate by tone.

**The Dark Screening Rule.** Backdrops are blurred and faded into the background; they never compete with the foreground title or controls.

## Shapes

Soft and rounded throughout, with pills for anything you tap and gentle 12px corners for media.

- **Pills (9999px):** icon buttons, chips, segmented controls, badges, the active-tab highlight in the rail, progress tracks.
- **Media corners (12px):** posters, episode thumbnails, library tiles and their skeletons.
- **Containers (16px):** sheets, dialogs, larger panels (`rounded-2xl`); bottom sheets round only their top corners.
- **The bar (25px):** the floating bottom nav, a one-off radius that sits between a card and a pill.
- **Controls (6px):** default text buttons and inputs (shadcn `rounded-md`). Use 8px only for the focus outline.
- Borders are 1px hairlines in Night Line. Images clip to their container radius (`overflow-hidden`).

## Components

### Buttons
Soft and touchable: comfortable to press, with quiet press feedback.
- **Shape:** gently rounded (6px); icon buttons are usually round pills.
- **Size:** 44px tall by default (`h-11`), with icon buttons 44×44. Small buttons are 40px, small icon buttons 36px, and those need an expanded hit area.
- **Primary:** Star Blue fill, Harbor Ink text (500, 14px), 16px side padding.
- **Secondary:** Night Raised fill with a faint white border (15% opacity), white text.
- **Ghost:** almost transparent with a Night Input Line stroke. This is the default for header back buttons (round).
- **Over image:** 40% black with a medium backdrop blur and white icon; no border.
- **Press:** scales to 0.95–0.97 and drops opacity to 0.75–0.9 over about 80–200ms. A global `button:active` opacity fallback covers unstyled buttons.
- **Focus:** a 2px Star Blue outline, 2px offset, 8px radius (D-pad and keyboard).

### Chips
- **Style:** filter chips are pill toggles, 36px tall (with an invisible 44px hit area), Night Hover fill, Night Line border, Moon Text caption.
- **Selected:** Star Blue fill and border, Harbor Ink text.
- **Segmented control:** a pill track (Night Hover with a 4px inset) holding 36px pill segments; the selected segment fills.

### Cards / Containers
- **Poster card:** a 2:3 image, 12px corners, Night Raised placeholder behind the lazy-loaded image, title below in caption size. Badges sit in the top corners: a Star Blue circle for "downloaded" or "watched", a spinner while downloading.
- **Library tile:** 16:9 artwork with 12px corners and the library name over a bottom fade.
- **"See all" tile:** the last cell of a rail, a translucent white fill at 5% with a 10% white border, an arrow and a caption label.
- **Shadow strategy:** flat (see the Floating Chrome Rule). Pressing scales to 0.97; hover lift is for desktop only.

### Inputs / Fields
- **Style:** 44px tall, 6px corners, 1px Night Input Line stroke, Void Black fill, 14px text, Haze Text placeholder.
- **Focus:** a 2px Star Blue ring with a 2px offset.
- **Disabled:** 50% opacity, not-allowed cursor.

### Navigation
- **Bottom bar (phones, portrait tablets):** a floating pill bar (66px, 25px radius) with frosted Night Surface at 65% opacity, an extra-large backdrop blur, a hairline border and the floating shadow. It has five equal tabs (Home, Library, Search, Downloads, Settings): a 22px Lucide icon (stroke 1.8) over an 11px label. Inactive tabs use Dust Text; the active tab uses Star Blue.
- **Rail (≥ 1024px):** 72px wide with the same frosted fill and a right hairline. The active tab gets a 56×32 Star Blue pill highlight at 12% opacity behind the icon only.
- **Active section:** the tab of the section you came from stays active on detail pages.
- **Page header:** a round ghost back button (44px), then the title and an optional caption subtitle, with actions on the right.

### List Rows
- **Style:** at least 48px tall with 16px side padding: an optional 20px icon (stroke 1.8), a body-size label, a caption-size value in Haze Text and a Dust Text chevron when the row is tappable. Destructive rows use Alert Coral and drop the chevron.

### Empty State
- A centered 48px Lucide icon in Dust Text (stroke 1.5), a title-size heading, body text in Haze Text (max ~24rem) and an optional action.

### Hero (detail page)
- A full-bleed blurred backdrop under the status bar, faded into the background by `item-page-overlay`. Over-image controls float on it. Title and metadata use theme tokens, never hard-coded white, so the day theme stays readable.

## Do's and Don'ts

### Do:
- **Do** keep the night background pure black (#000000) and separate surfaces by tone (#121417 → #1a1e23).
- **Do** use Star Blue only for state, selection, progress and the primary action, with Harbor Ink on top of it.
- **Do** use the named type tokens (`text-page`, `text-section`, `text-body`, `text-caption`, `text-label`) and the spacing tokens (`gutter`, `gutter-wide`, `section`).
- **Do** give every tap target at least 44px, expanding the hit area with `after:` insets when the visual is smaller.
- **Do** use 12px corners for media and pills for buttons, chips and badges.
- **Do** check every change in both themes; use theme tokens rather than literal white or black for text.
- **Do** use Lucide icons at a stroke width of 1.8 (1.5 for large empty-state icons).
- **Do** route insets through `safe-*` utilities or `--sat/--sab/--sal/--sar`.

### Don't:
- **Don't** introduce a second accent color, or use the legacy orange/teal/green/rating tokens.
- **Don't** put shadows or blur on content cards, rows or sections; only floating chrome gets them.
- **Don't** add a second typeface or weights outside 400–700.
- **Don't** hard-code white text on hero art; the day theme fades to a light background.
- **Don't** add arrow buttons to media rails; they swipe and snap.
- **Don't** write user-visible text in components; all copy goes through i18n.
