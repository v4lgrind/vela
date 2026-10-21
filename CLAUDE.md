# Project Guidelines

## Project Overview

This is **Vela**, a Jellyfin media client built with **Vue 3 + Capacitor v8**, targeting **Android devices only**. It uses ExoPlayer (Media3) for native video playback on Android, HLS.js as a fallback for the dev-server web preview, Pinia for state management, Reka UI for headless components, Tailwind CSS v4 for styling, and the official Jellyfin SDK for API calls.

## Key Conventions

- **Package manager:** npm
- **Build:** `npm run build` (with type check) or `npm run build:skip-types` (faster)
- **Dev server:** `npm run dev` (http://localhost:5173)
- **Android:** `npm run android:build` builds a debug APK end-to-end
- **Styling:** Tailwind CSS v4 utility classes; use `clsx` + `tailwind-merge` via the `cn()` helper
- **Components:** Prefer Reka UI headless primitives before building custom components
- **Icons:** Lucide via `lucide-vue-next`
- **State:** Pinia stores in `src/stores/`; use `pinia-plugin-persistedstate` for persistence
- **Routing:** Vue Router in `src/router/`
- **API:** Jellyfin SDK via service wrappers in `src/services/`

<!-- WEDNESDAY_SKILLS_START -->
## Wednesday Agent Skills

This project uses Wednesday Solutions agent skills for consistent code quality and design standards.

### Available Skills

<available_skills>
  <skill>
    <name>wednesday-design</name>
    <description>Design and UX guidelines for Wednesday Solutions projects. Covers visual design tokens, animation patterns, component standards, accessibility, and user experience best practices for Vue 3/Capacitor applications. ENFORCES use of approved component libraries only.</description>
    <location>.wednesday/skills/wednesday-design/SKILL.md</location>
  </skill>
  <skill>
    <name>wednesday-dev</name>
    <description>Technical development guidelines for Wednesday Solutions projects. Enforces import ordering, complexity limits, naming conventions, TypeScript best practices, and code quality standards for Vue 3/Capacitor applications.</description>
    <location>.wednesday/skills/wednesday-dev/SKILL.md</location>
  </skill>
</available_skills>

### How to Use Skills

When working on tasks, check if a relevant skill is available above. To activate a skill, read its SKILL.md file to load the full instructions.

For example:
- For code quality and development guidelines, read: .wednesday/skills/wednesday-dev/SKILL.md
- For design and UI component guidelines, read: .wednesday/skills/wednesday-design/SKILL.md

### Important

- The wednesday-design skill contains 492+ approved UI components. Always check the component library before creating custom components.
- The wednesday-dev skill enforces import ordering, complexity limits (max 8), and naming conventions.

<!-- WEDNESDAY_SKILLS_END -->

## Session Progress Tracking

At the end of each session (or when work is paused), write a progress markdown file in `docs/session-progress/` summarizing:
- What was investigated and found
- Changes made
- What's left to do / next steps

Name the file with the date and a short topic slug, e.g. `2026-03-20-player-subtitle-fix.md`. This allows the user to resume context in future sessions.