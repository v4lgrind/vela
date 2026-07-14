# 2026-07-09 — Découpage de PlayerPage.vue en composables

## Objectif
`PlayerPage.vue` faisait 2 250 lignes et mélangeait trois chemins de lecture
(web HLS.js, natif ExoPlayer, offline) plus l'UI. Découpage en composables sur
la branche `refactor/player-page-split` (basée sur `chore/health-check-fixes`).

## Résultat

| Fichier | Lignes | Rôle |
|---|---|---|
| `pages/PlayerPage.vue` | 522 (dont ~300 de template/styles) | Orchestrateur : câblage des composables, onMounted/onBeforeUnmount |
| `composables/player/usePlayerSession.ts` | 419 | **État partagé** (position, pistes, qualité, flags) + API Jellyfin : reporting Sessions/Playing/*, `fetchPlaybackInfo`, parsing des streams, `deleteActiveEncodings` |
| `composables/player/useWebPlayer.ts` | 555 | Chemin web : `<video>`/HLS.js (fragment loader Jellyfin), DirectPlay, sous-titres blob, fullscreen, switch audio/qualité + rollback |
| `composables/player/useNativePlayer.ts` | 465 | Chemin Android ExoPlayer : init + tous les listeners NativeVideo, fallbacks codec (`detectCodecFallbacks`), `restartWithAudio`, switch qualité natif |
| `composables/player/useOfflinePlayer.ts` | 330 | Lecture fichier téléchargé (natif file:// / web blob), progression locale IndexedDB |
| `composables/player/usePlayerControls.ts` | 134 | Overlay de contrôles auto-masqué, menus, tap/double-tap, clavier |
| `composables/player/useSkipIntro.ts` | 91 | Segments intro/outro + bouton Skip Intro |
| `composables/player/useStreamInfo.ts` | 79 | Modal Stream Info + polling TranscodingInfo |
| `utils/mediaTitle.ts` | 18 | `buildMediaTitle` (fonction pure) |

## Principes du découpage
- **Refactor mécanique, comportement préservé** : les corps de fonctions sont
  copiés verbatim (commentaires compris) ; seuls les accès passent par les refs
  de la session partagée.
- `usePlayerSession` est le conteneur d'état créé en premier ; les autres
  composables le reçoivent en paramètre (pas de singleton module → l'état est
  bien re-créé à chaque montage de la page).
- Les flags autrefois en `let` partagés (`isSwitching`, `isOfflinePlayback`,
  `restartInProgress`) sont devenus des refs de session car ils traversent les
  chemins web/natif/offline. `nativeSwitchingQuality` reste local au natif.
- Le couplage contrôles ↔ lecteur web est cassé par injection : `usePlayerControls`
  reçoit `onTogglePlayPause`/`onDoubleTapSeek` en callbacks.
- Template et styles de `PlayerPage.vue` inchangés.

## Différences volontaires (sans effet)
- `switchQualityNative` ne ferme plus `qualityMenuOpen` (ce menu web n'est
  jamais ouvert sur natif — c'était un no-op).
- `openInfoModal` : `showControls()` est appelé après l'ouverture (avant :
  entre l'ouverture et le fetch) — sans effet observable.
- Le pattern « seek après loadedmetadata » du chemin DirectPlay est le helper
  `startDirectPlay` (déjà factorisé dans la session précédente).

## Vérifications
- `npm run build` (vue-tsc + vite) : ✅
- `npm test` : ✅ 57/57
- Diff sur PlayerPage.vue : +70 / −1773

⚠️ **Non testé sur device** : le refactor est mécanique et le type check couvre
les templates, mais une passe de test manuel sur Android (lecture online,
offline, switch audio/qualité, skip intro, next episode) est recommandée avant
merge.

## Prochaines étapes possibles
- Tester sur device Android (`npm run android:build`).
- Typer les `any` restants (items Jellyfin → `BaseItemDto` du SDK).
- Même traitement pour `ItemDetailsPage.vue` (1 100 lignes) si souhaité.
