# 2026-07-09 — Analyse de code & correction des code smells

## Objectif
Relecture complète du code (stores, services, pages) pour corriger les duplications,
le code mort et les incohérences, en privilégiant la lisibilité pour un dev humain.

## Constats & corrections

### `src/store/jellyfin-store.ts` (le plus touché : −140 lignes)
- **Supprimé `_buildApi`** : copie exacte de `initializeApi` ; `initializeApiAsync` appelle
  maintenant `initializeApi`. La construction du client SDK est factorisée dans `_createJellyfin()`
  (aussi utilisée par `login`).
- **Supprimé le bloc download mort** : `downloadItem`, `downloadItemForOffline` (quasi-copies
  l'une de l'autre), `cancelDownload`, `isDownloading` et le state `downloadProgress` n'étaient
  utilisés nulle part — tout passe par `download-store` depuis longtemps.
- **`currentItem` déplacé de `actions` vers `state`** : il était déclaré au milieu des actions
  (`currentItem: null as any | null`), ce qui fonctionnait par accident et n'était pas réactif.
- **Factorisé `_registerSavedServer(serverUrl, userName)`** : le try/catch « récupérer le nom du
  serveur, sinon hostname » était dupliqué dans `login` et `quickConnectAuthenticate`.
- **Helper `httpError(message, status)`** : la construction d'erreur axios-style était copiée
  3× dans les fonctions Quick Connect. Supprimé aussi l'indirection inutile `const resp = { data }`.

### `src/services/offlineDatabase.ts`
- **Nouveau `buildDownloadedMedia(metadata, filePath, fileSize)`** exporté : la construction du
  record (avec champs série/album selon le type) était dupliquée dans `downloadService.ts` et
  `offline-store.ts` (reconcile). Les deux l'utilisent maintenant.
- **Factorisé `getDownloadsByIndex`** : les 4 lecteurs par index (type/seriesId/seasonId/albumId)
  étaient des copies à un paramètre près.

### `src/services/downloadService.ts`
- `cacheArtwork` dupliquait intégralement le corps de `cacheArtworkById` → délègue maintenant.
- `getMediaType` supprimé (remplacé par `buildDownloadedMedia`).

### `src/store/download-store.ts`
- Doc-comment orphelin dupliqué au-dessus de `checkNeedsTranscode` supprimé.
- `cancelAll` et `removeTask` nettoient maintenant `_transcodeOptionsQueue` (incohérence avec
  `cancelDownload` qui le faisait déjà — fuite mineure de Map sinon).

### `src/pages/ItemDetailsPage.vue`
- `toggleWatched` / `toggleWatchedSeason` / `toggleWatchedEpisode` : corps identiques →
  helper partagé `togglePlayedState(target)`.
- `scrollCast` / `scrollSimilar` identiques → `scrollRail(rail, dir)`.
- `handleDownload` / `handleEpisodeDownload` quasi-identiques → `requestDownload(id, metadata, failMessage)`.
- `onTranscodeConfirm` / `onTranscodeOriginal` identiques (à `options` près) → `startPendingDownloads(options?)`.
- `console.log/error` → `logger` ; `alert('Failed to delete')` → toast `showError` (cohérent avec le reste).
- Alias inutile `formatTrackDuration = formatTicksDuration` supprimé.

### `src/pages/PlayerPage.vue`
- **Code mort supprimé** : les refs `audioDropdown` / `subtitleDropdown` / `qualityDropdown` /
  `qualityDropdownNative` n'étaient plus liées à aucun élément du template (remplacées par les
  `PlayerBottomSheet`), donc `handleClickOutside` et ses add/removeEventListener ne faisaient rien.
- **Factorisé `startDirectPlay(video, startSeconds)`** : le pattern « src + seek après
  loadedmetadata + play + startProgressReporting » était copié dans `initPlayer`, `rollbackAudio`
  et `switchQuality`. Bonus : la version de `switchQuality` faisait le seek *avant* le chargement
  des métadonnées (peu fiable) — désormais alignée sur les deux autres.
- `controlsVisible.value == true` → `controlsVisible.value`.

## Vérifications
- `vue-tsc --noEmit` : ✅ aucun problème
- `npm test` (vitest) : ✅ 57/57 tests passent
- `npm run build:skip-types` : ✅ build OK
- Diff : **+171 / −418 lignes** sur 7 fichiers

## Smells notés mais volontairement NON corrigés (risque > bénéfice)
- `constants.ts` : les deux device profiles (`deviceProfile` / `nativeAndroidDeviceProfile`) se
  ressemblent beaucoup mais leurs différences (canaux audio, HDR, codecs, `IsRequired`) sont
  intentionnelles web vs natif — les fusionner risquerait de casser la lecture.
- `offline-store.setupAutoSync` : poll toutes les 1 s via `setInterval` ; un `watch` Vue serait
  plus propre mais le scope d'effet dans un store Pinia rend le changement risqué.
- `PlayerPage.vue` reste ~2200 lignes : `initNativePlayer` et `initOfflinePlayer` partagent des
  patterns de listeners mais avec des différences subtiles (reporting réseau vs sauvegarde
  offline). Un découpage en composables serait le prochain gros chantier.
- `syncService.isSyncing` + `offline-store.syncInProgress` : double garde redondante, inoffensive.
- `main.ts` ligne 29 : un `console.error` au bootstrap (avant init) — laissé tel quel.

## Prochaines étapes possibles
- Découper `PlayerPage.vue` en composables (`useNativePlayback`, `useWebPlayback`, `useOfflinePlayback`).
- Typer les `any` des items Jellyfin avec les types du SDK (`BaseItemDto`).
