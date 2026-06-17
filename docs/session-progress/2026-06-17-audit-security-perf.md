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

### Fixes appliqués (commit `6e4fc97`)

**SEC-2 — tokens stockés via @capacitor/preferences**
- `jellyfin-store.ts` : `accessToken` exclu du persist Pinia, stocké via `Preferences.set/get` avec fallback localStorage
- `initializeApiAsync()` charge le token depuis Preferences au démarrage

**PERF-3 — polling stream info**
- `PlayerPage.vue` : intervalle 2s → 5s

**PERF-4 — throttle currentTime watcher**
- `PlayerPage.vue` : `watch` → `watchThrottled` (@vueuse/core, 500ms)

**SMELL-4 — détection codec centralisée**
- `src/utils/codecDetection.ts` : `CODEC_MIME_MAP`, `getDeviceCodecs`, `isCodecSupported`, `isDolbyVision`
- Importé dans `PlayerPage.vue` et `download-store.ts` (code local supprimé)

**SMELL-6 (partiel) — types Jellyfin**
- `src/types/jellyfin.ts` : interfaces `MediaStream`, `MediaSource`, `PlaybackInfo`, `JellyfinItem`, etc.
- Utilisé dans `PlayerPage.vue` pour typer `mediaSource`, `audioList`, `subtitleList`, `videoStream`

**Mineurs**
- `src/utils/logger.ts` : wrapper conditionnel dev-only pour console
- `src/composables/usePlatform.ts` : centralise `Capacitor.isNativePlatform()` detection
- `src/store/metadata-cache-store.ts` : TTL 7 jours avec `_cachedAt`

### Fixes appliqués (commit `996c8d0`)

**LOGS — logger appliqué à tout le codebase**
- `downloadService.ts`, `offlineDatabase.ts`, `offlineDetection.ts`, `syncService.ts`
- `offline-store.ts`, `download-store.ts`, `jellyfin-store.ts`, `audioPlayerService.ts`
- `PlayerPage.vue`, `SearchBar.vue`, `LibraryItemsPage.vue`

**usePlatform appliqué**
- `App.vue` : remplace 3 occurrences de `Capacitor.isNativePlatform()`
- `PlayerPage.vue` : `const isNative = Capacitor.isNativePlatform()` → `const { isNative } = usePlatform()`
- `ItemDetailsPage.vue` : `initCast()` utilise `usePlatform()`

**SMELL-5 — toast notifications**
- `src/composables/useToast.ts` : état global des toasts, `show()`, `showError()`, `showSuccess()`, `showWarning()`
- `src/components/ui/toast/AppToast.vue` : composant Reka UI Toast avec icônes par type
- Monté dans `App.vue` comme provider global
- `ItemDetailsPage.vue` : erreurs de téléchargement (download/bulk/transcode) notifiées via `showError()`
- `SearchPage.vue` : échec de recherche notifié via `showError()`

**MediaStream types étendus**
- `src/types/jellyfin.ts` : ajout `RealFrameRate`, `AverageFrameRate`, `ChannelLayout`, `ColorSpace`, `ColorTransfer`, `ColorPrimaries`, `VideoRange`, `VideoRangeType`

## Ce qui reste à faire

**SMELL-1** : `PlayerPage.vue` (~2 300 lignes) — découpage en sous-composants WebVideoPlayer, NativePlayerContainer, TrackSelectionSheet, StreamInfoModal
→ Risqué sans pouvoir tester l'APK, à faire dans une session dédiée

**SMELL-2** : `ItemDetailsPage.vue` (~1 100 lignes) — découpage EpisodeGrid, MediaInfoDialog, ItemHero, SimilarItems
→ Même raison

**SMELL-3** : `jellyfin-store.ts` (~630 lignes) — split en jellyfinAuthStore + jellyfinLibraryStore
→ Impact sur tous les imports, risqué sans tests automatisés

**PERF-5** : Pas de virtualisation dans SearchBar (200+ résultats) → `@tanstack/vue-virtual`
→ Package non installé, nécessite `npm install @tanstack/vue-virtual`

**Note SEC-1 incomplète** : `api_key` conservé dans `audioPlayerService.ts:buildAudioUrl()` pour le `<audio>` element natif — impossible d'injecter des headers sur un src d'élément `<audio>`. Limitation connue, documentée.
