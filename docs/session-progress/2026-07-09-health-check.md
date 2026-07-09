# 2026-07-09 — Health check & analyse du code

## Investigué
- État git, build, type-check, tests unitaires, audit deps, scan code smells.

## Trouvé
- `main` était cassé au type-check : 2 erreurs TS dans `src/components/BottomNav.vue`
  introduites par le commit `d200987` (oled redesign #23). Non détecté car
  `android:build` utilise `build:skip-types`.
- Tests : 57/57 passent. `vite build` OK (warnings : import mixte
  statique/dynamique de `DownloadPlugin.ts`, chunk > 500 kB).
- `npm audit` : 22 vulnérabilités (1 critique, 16 high) — toutes côté dev
  (vite/vitest/jsdom), pas dans le bundle livré. `npm audit fix` en règle la partie.
- 138 usages de `any` concentrés dans jellyfin-store, PlayerPage, ItemDetailsPage ;
  0 `@ts-ignore` ; pas de TODO/FIXME.
- Stockage des tokens sain : Capacitor Preferences avec fallback localStorage web
  et chemin de migration documenté.

## Changements
- Fix des 2 erreurs TS dans `BottomNav.vue` (import `computed` inutilisé supprimé ;
  cast `tab.match as readonly string[]` pour `.includes`). Type-check vert.
- `offline-store.ts` : import dynamique de `DownloadPlugin` converti en statique
  (déjà dans le chunk principal via `downloadService.ts`) → warning Vite disparu.
- `.gitignore` : ajout de `.codex/` et `AGENTS.md`.
- CI `android-build.yml` : step `Type check` (`npx vue-tsc --noEmit`) ajouté avant le build.
- Vérifié : type-check OK, 57/57 tests, `vite build` OK (reste seulement le warning
  chunk > 500 kB, cosmétique). Rien de commité.

## Reste à faire
- Committer le tout (branche + PR, pas de push direct sur main). Attention : le PAT
  doit avoir le scope `workflow` pour pousser la modif du workflow CI.
- Optionnel : `npm audit fix` / bump deps mineures (Capacitor 8.4.1, reka-ui 2.10.1…).
