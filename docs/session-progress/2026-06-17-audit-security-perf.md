# Session progress — 2026-06-17 — Audit complet + fixes sécurité/perf

## Ce qui a été fait

### Audit
Exploration complète du codebase (3 agents en parallèle) couvrant :
- Structure des composants + stores + router
- Services, sécurité, gestion d'auth
- Player, performances, intégration Android/Capacitor

### Fixes appliqués (commit `4e21723`)

**SEC-1 — api_key supprimé des URLs construites par l'app**
- `downloadService.ts` : URL de téléchargement, sous-titres, images, segments — remplacés par header `X-Emby-Token`
- `PlayerPage.vue` : URLs HLS (DirectPlay, fallback, switch audio) + fetch des sous-titres — header injecté via `xhrSetup` HLS.js

**SEC-3 — cleartext restreint aux IPs privées**
- Créé `android/app/src/main/res/xml/network_security_config.xml`
- Retiré `android:usesCleartextTraffic="true"` du manifest → remplacé par `networkSecurityConfig`

**SEC-4 — validation URL serveur**
- `LoginPage.vue` : fonction `validateServerUrl()` appelée avant `login()` et `quickConnectInitiate()`

**MEM-1 — fuites listeners App.vue**
- Handlers `mediaQuery`, `visibilitychange`, `resize` nommés et supprimés dans `onBeforeUnmount`

**MEM-3 — fuites listeners fullscreen PlayerPage.vue**
- Lambdas anonymes remplacées par `onFullscreenChange()` nommé et supprimé dans `onBeforeUnmount`

**PERF-1 — lazy loading routes**
- `router/index.ts` : tous les imports de pages convertis en `() => import(...)`

**PERF-2 — code splitting Vite**
- `vite.config.ts` : `manualChunks` pour hls.js, @jellyfin/sdk, vue, ui + `sourcemap: false`

## Ce qui reste à faire (plan complet dans `/root/.claude/plans/ok-c-est-bon-je-partitioned-gem.md`)

**SEC-2** : Tokens d'auth encore en clair dans `localStorage` via `jellyfin-store` (`persist: true`).
→ Migrer vers `@capacitor/preferences` pour `accessToken` + `savedServers`

**Note SEC-1 incomplète** : `api_key` conservé dans l'URL audio du `<audio>` element (`audioPlayerService.ts:141`) — impossible d'injecter des headers sur un `<audio>` src natif. Limitation connue.

**SMELL-1** : `PlayerPage.vue` (2 284 lignes) — découpage en sous-composants WebVideoPlayer, NativePlayerContainer, TrackSelectionSheet, StreamInfoModal

**SMELL-2** : `ItemDetailsPage.vue` (1 121 lignes) — découpage EpisodeGrid, MediaInfoDialog, ItemHero, SimilarItems

**SMELL-3** : `jellyfin-store.ts` (631 lignes) — split en jellyfinAuthStore + jellyfinLibraryStore

**SMELL-4** : Détection codec dupliquée entre `download-store.ts` et `PlayerPage.vue` → extraire dans `src/utils/codecDetection.ts`

**SMELL-5** : Erreurs silencieuses (fire-and-forget) dans ItemDetailsPage, SearchPage, OfflineLibraryPage → système de toast

**SMELL-6** : 47 occurrences de `any` dans PlayerPage → créer `src/types/jellyfin.ts`

**PERF-3** : Polling stream info à 2s → augmenter à 5s

**PERF-4** : Watcher `currentTime` non throttlé → `watchThrottled` de VueUse

**PERF-5** : Pas de virtualisation dans SearchBar (200+ résultats) → `@tanstack/vue-virtual`

**Mineurs** : logger conditionnel, expiration cache métadonnées (7j), `usePlatform.ts` composable
