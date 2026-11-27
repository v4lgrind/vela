# Plexamp lot 1 (menus, radio, minuteur, fond) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menus « Aller à l'artiste / l'album » (⋯ + appui long), radio Instant Mix, minuteur de sommeil natif, fond flouté aux couleurs de la pochette.

**Architecture:** Une fonction pure décide quelles actions de musique afficher ; deux enveloppes Reka (DropdownMenu pour « ⋯ », ContextMenu pour l'appui long) les rendent ; un composable les exécute. La radio est un nouveau `MusicPort.radio` rechargé comme la lecture aléatoire de bibliothèque. Le minuteur vit dans `MusicService.kt` (commande de session personnalisée) pour le moteur natif, et dans `audioPlayerService` pour Cast / web.

**Tech Stack:** Vue 3 + Reka UI + Pinia + vitest ; Kotlin Media3 (MediaLibraryService) + JUnit.

**Spec:** `docs/superpowers/specs/2026-11-27-plexamp-lot1-design.md`

## Global Constraints

- Aucun SDK Jellyfin hors `src/backends/jellyfin` (`src/architecture.test.ts` doit rester vert).
- Tout texte visible passe par i18n, en **et** fr (`src/locales/{en,fr}.json`, `src/i18n/hardcodedText.test.ts`).
- Composants : Reka UI (`ContextMenu*`, `DropdownMenu*`), icônes `lucide-vue-next`, classes via `cn()`.
- Styles d'item de menu identiques à `TrackActionsMenu.vue` (`min-h-11 rounded-lg px-3 py-2.5 text-sm …`).
- Complexité ≤ 8 par fonction, ordre des imports du skill wednesday-dev.
- Minuteur : choix 15, 30, 45, 60 min, fin du titre, fin de l'album ; fondu sur les **10 dernières secondes** puis **pause** (pas stop) ; non persisté.
- Radio : lots de **100** titres ; recharge quand il reste **≤ 5** titres (`LIBRARY_SHUFFLE_REFILL_AT`).
- Fond : fondu **400 ms** au changement de pochette ; contraste texte AA.
- Vérifs : `npm test`, `npm run build`, `./gradlew :app:testDebugUnitTest` (via Docker si pas de SDK local, cf. mémoire), test sur l'appareil.

## Review Focus

1. **Appui long sur une vignette d'album puis relâcher** → le menu s'ouvre, l'album ne s'ouvre pas, et le défilement de la grille reste fluide (pas de menu natif « copier l'image »). Vérifié sur l'appareil, Task 5 étape 6.
2. **Radio sans résultat** (titre isolé, serveur qui renvoie 0 élément ou erreur) → toast d'erreur, la file en cours est intacte. Test dans Task 4.
3. **Minuteur annulé ou modifié pendant le fondu** → le volume revient à sa valeur d'avant. Test `SleepTimerTest` dans Task 7.
4. **« Fin de l'album » quand l'album est le dernier de la file, ou en répétition « un »** → pause à la fin de ce titre/album, pas de boucle infinie. Tests dans Task 6 et Task 7.
5. **File sauvegardée avant ce lot (sans `artists`) et hors ligne** → « Aller à l'album » reste proposé, « Aller à l'artiste » est simplement absent, pas d'erreur. Test dans Task 2.

---

### Task 1: Les artistes voyagent avec la file de lecture

**Files:**
- Modify: `src/store/audio-player-store.ts` (interface `AudioTrack`)
- Modify: `src/utils/audioTrack.ts`
- Test: `src/utils/audioTrack.test.ts`

**Interfaces:**
- Produces: `AudioTrack.artists?: { id: string; name: string }[]` (absent sur les anciennes files).

- [ ] **Step 1: Write the failing tests** in `audioTrack.test.ts`:
  - `it('keeps the track artists that have an id')` : track avec `artists: [{id:'a1',name:'Daft Punk'},{name:'Sans id'}]` → `artists` vaut `[{id:'a1',name:'Daft Punk'}]`.
  - `it('falls back to the album artists')` : `artists: []`, `albumArtists: [{id:'a2',name:'X'}]` → `[{id:'a2',name:'X'}]`.
- [ ] **Step 2:** `npx vitest run src/utils/audioTrack.test.ts` → FAIL (`artists` undefined).
- [ ] **Step 3:** Ajouter le champ à `AudioTrack` (commentaire : absent sur les files d'avant 2026-11-27) et le remplir dans `trackToAudioTrack`.
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5: Commit** `feat(audio): keep track artists in the queue`

### Task 2: Quelles actions afficher (logique pure)

**Files:**
- Create: `src/utils/musicActions.ts`
- Test: `src/utils/musicActions.test.ts`

**Interfaces:**
- Consumes: `AudioTrack.artists` (Task 1), `Track`, `Album`, `ArtistRef` de `@/domain`.
- Produces:
  ```ts
  export type MusicTarget =
    | { kind: 'track'; id: string; albumId?: string; artists: ArtistRef[] }
    | { kind: 'album'; id: string; artists: ArtistRef[] };
  export type MusicAction =
    | { type: 'goToAlbum'; itemId: string }
    | { type: 'goToArtist'; itemId: string; name: string }
    | { type: 'radio'; seedId: string }
    | { type: 'playNext' } | { type: 'addToQueue' };
  export interface MusicActionContext { currentPageId?: string; online: boolean; canRadio: boolean; queueActions: boolean }
  export function trackTarget(t: Track | AudioTrack): MusicTarget;
  export function albumTarget(a: Album): MusicTarget;
  export function buildMusicActions(target: MusicTarget, ctx: MusicActionContext): MusicAction[];
  ```
  Ordre : goToAlbum, goToArtist (un par artiste), radio, playNext, addToQueue. `queueActions: false` dans le lecteur plein écran.

- [ ] **Step 1: Write the failing tests:**
  - `track with two artists` → deux `goToArtist` dans l'ordre, noms conservés.
  - `hides goToAlbum on that album's page` (`currentPageId === albumId`) et `hides goToArtist on that artist's page`.
  - `skips artists without id` ; `album without artists` → pas de `goToArtist`.
  - `hides radio offline or when the backend can't` (`online:false` ou `canRadio:false`).
  - `old queue track (no artists) offline` → `[goToAlbum]` seulement (Review Focus 5).
  - `trackTarget(AudioTrack)` lit `albumId` et `artists ?? []` ; un `albumId` égal à l'id du titre (repli de `trackToAudioTrack`) compte comme inconnu.
- [ ] **Step 2:** `npx vitest run src/utils/musicActions.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter les trois fonctions.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(music): decide go-to/radio/queue actions per item`

### Task 3: `MusicPort.radio` (Jellyfin Instant Mix)

**Files:**
- Modify: `src/domain/backend.ts` (`MusicPort`), `src/domain/server.ts` (`Capabilities`)
- Modify: `src/backends/jellyfin/music.ts`, `src/backends/jellyfin/index.ts`
- Modify: `src/backends/plex/music.ts`, `src/backends/plex/index.ts`
- Test: `src/backends/jellyfin/backend.test.ts` (même style que les tests existants), `src/backends/plex/music.test.ts`

**Interfaces:**
- Produces: `MusicPort.radio(seedId: ItemId, limit: number): Promise<Track[]>` ; `Capabilities.radio: boolean` (Jellyfin `true`, Plex `false`).

- [ ] **Step 1: Failing tests:**
  - Jellyfin : `radio('t1', 100)` appelle `GET /Items/t1/InstantMix` avec `userId` et `limit=100`, et renvoie les `Items` mappés en `Track` (filtrer `kind === 'track'`).
  - Plex : `radio()` renvoie `[]` sans requête réseau.
- [ ] **Step 2:** `npx vitest run src/backends` → FAIL.
- [ ] **Step 3:** Implémenter (Jellyfin via `client.get`, comme `list`), ajouter `radio` aux deux objets `Capabilities` et à tout fixture/fake de `Capabilities` que le type check signale.
- [ ] **Step 4:** `npx vitest run src/backends && npx vue-tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(music): radio from Jellyfin Instant Mix`

### Task 4: Lancer et recharger une radio

**Files:**
- Modify: `src/store/audio-player-store.ts`
- Modify: `src/services/audioPlayerService.ts` (`setupLibraryShuffleRefill`, `refillLibraryShuffle`, ligne ~191)
- Modify: `src/utils/audioQueue.ts`
- Test: `src/utils/audioQueue.test.ts`, `src/store/audio-player-store.test.ts` (créer si absent)

**Interfaces:**
- Consumes: `MusicPort.radio` (Task 3).
- Produces:
  - `radioQueue<T extends {id:string}>(seed: T | null, mix: T[]): T[]` dans `audioQueue.ts` : le titre de départ en tête, sans doublon.
  - Store : état `radioSeed: string | null` (persisté, à côté de `libraryShuffle`) ; action `playRadio(seedId: string, tracks: AudioTrack[])` (= `playAlbum(tracks, 0)` sans mélange, puis `radioSeed = seedId`). `playAlbum` et `stop` remettent `radioSeed` à `null`, comme `libraryShuffle`.
  - Service : `audioPlayerService.startRadio(target: MusicTarget): Promise<void>`. Titre : seed = le titre (récupéré via `catalog.item` s'il n'est pas déjà un `Track`). Album / artiste : seed = null.

- [ ] **Step 1: Failing tests:**
  - `radioQueue(seed, [x, seed, y])` → `[seed, x, y]` ; `radioQueue(null, [x])` → `[x]`.
  - Store : `playRadio('s', tracks)` met `radioSeed='s'`, `libraryShuffle=null`, `shuffle` inchangé mais file non mélangée ; `playAlbum` ensuite → `radioSeed=null`.
  - Service (Review Focus 2) : `startRadio` avec un `radio()` qui renvoie `[]` ou rejette → file inchangée, `toast.showError(t('audio.radioFailed'))` appelé.
- [ ] **Step 2:** `npx vitest run src/utils/audioQueue.test.ts src/store` → FAIL.
- [ ] **Step 3:** Implémenter. Généraliser le watcher : recharger si `libraryShuffle` **ou** `radioSeed` ; pour la radio, `music.radio(currentTrack.id, RADIO_BATCH = 100)` puis `addToQueue(freshTracks(queue, picks))`, abandon si `radioSeed` a changé entre-temps. Remettre `radioSeed = null` là où `libraryShuffle` l'est pour une file venue de la voiture.
- [ ] **Step 4:** → PASS, plus `npm test` complet vert.
- [ ] **Step 5: Commit** `feat(audio): start and top up a radio`

### Task 5: Menus « ⋯ » et appui long

**Files:**
- Create: `src/composables/useMusicActions.ts`
- Create: `src/components/MusicContextMenu.vue`
- Modify: `src/components/TrackActionsMenu.vue`
- Modify: `src/pages/LibraryItemsPage.vue` (lignes de chansons ~113-130, vignettes d'albums ~134+)
- Modify: `src/pages/ItemDetailsPage.vue` (pistes ~395, albums de l'artiste ~417, `TrackActionsMenu` de l'en-tête ~122)
- Modify: `src/pages/SearchPage.vue` (résultats titres et albums)
- Modify: `src/components/ExpandedAudioPlayer.vue` (en-tête)
- Modify: `src/locales/en.json`, `src/locales/fr.json`

**Interfaces:**
- Consumes: `buildMusicActions`, `trackTarget`, `albumTarget` (Task 2) ; `audioPlayerService.startRadio` (Task 4).
- Produces:
  - `useMusicActions(): { actionsFor(target: MusicTarget, opts?: { queueActions?: boolean }): ComputedRef<MusicAction[]> ; run(action: MusicAction, target: MusicTarget): void }`. `currentPageId` = `route.params.id` ; `online` = store hors ligne ; `canRadio` = `backend.capabilities.radio`. `run` : `goToAlbum`/`goToArtist` → `audioStore.isExpanded = false` puis `router.push({ name: 'ItemDetails', params: { id } })` ; `radio` → `startRadio` ; `playNext`/`addToQueue` sur un album → `music.albumTracks` puis `audioStore.playNext/addToQueue` (même toast que `queueAlbum` d'`ItemDetailsPage`).
  - `TrackActionsMenu` prend une prop `target?: MusicTarget` en plus de `track` ; ses items existants restent, les actions « aller à » / radio s'ajoutent au-dessus, séparées par `DropdownMenuSeparator`.
  - `<MusicContextMenu :target>` : `ContextMenuRoot` + `ContextMenuTrigger as-child` autour du slot ; mêmes items rendus en `ContextMenuItem`.
  - Clés i18n : `audio.goToAlbum` (« Aller à l'album »), `audio.goToArtist` (« Aller à {name} »), `audio.startRadio` (« Lancer la radio »), `audio.radioFailed` (« Impossible de lancer la radio »), `audio.sleepTimer` (« Minuteur »).
- Lecteur plein écran : nouveau bouton « ⋯ » (`EllipsisVertical`, `size-11`) à droite de la file, `actionsFor(trackTarget(currentTrack), { queueActions: false })` + item « Minuteur » (ouvre la feuille de la Task 6). Pour une file sans `artists` et en ligne, compléter à l'ouverture via `backend.catalog.item(id)` (garder le résultat en cache pour ce titre).

- [ ] **Step 1:** Écrire `useMusicActions` et le test `src/composables/useMusicActions.test.ts` : `run(goToArtist)` referme le lecteur et pousse la bonne route ; `run(addToQueue)` sur un album appelle `albumTracks` puis `addToQueue`.
- [ ] **Step 2:** `npx vitest run src/composables/useMusicActions.test.ts` → FAIL puis implémenter → PASS.
- [ ] **Step 3:** Créer `MusicContextMenu.vue`, étendre `TrackActionsMenu.vue`, ajouter les clés i18n.
- [ ] **Step 4:** Brancher sur les pages : lignes de titres entourées de `MusicContextMenu` (le ⋯ reste) ; vignettes d'albums entourées de `MusicContextMenu` ; sur ces déclencheurs ajouter `select-none [-webkit-touch-callout:none]` et `draggable="false"` sur l'image (Review Focus 1).
- [ ] **Step 5:** `npm test && npm run build` → verts (dont `hardcodedText.test.ts`).
- [ ] **Step 6: Vérif appareil** (APK Docker, cf. mémoire) : appui long sur un album de l'onglet Albums → menu, relâcher n'ouvre pas l'album ; défilement normal ; feat. → deux lignes ; « Aller à l'album » depuis le lecteur referme le lecteur et ouvre l'album.
- [ ] **Step 7: Commit** `feat(music): go to artist/album and radio menus`

### Task 6: Minuteur — côté JS (choix, affichage, Cast / web)

**Files:**
- Create: `src/utils/sleepTimer.ts`, `src/utils/sleepTimer.test.ts`
- Create: `src/components/SleepTimerSheet.vue`
- Modify: `src/store/audio-player-store.ts` (`AudioController`), `src/services/audio/types.ts` (`AudioEngine`)
- Modify: `src/services/audio/{nativeAudioEngine,castAudioEngine,webAudioEngine}.ts`, `src/services/audioPlayerService.ts`
- Modify: `src/plugins/NativeAudioPlugin.ts`
- Modify: `src/components/ExpandedAudioPlayer.vue`, locales

**Interfaces:**
- Produces:
  ```ts
  export type SleepMode = 'minutes' | 'endOfTrack' | 'endOfAlbum';
  export interface SleepTimer { mode: SleepMode; endsAt?: number /* epoch ms, mode minutes */; armedIndex: number }
  /** Secondes restantes pour l'affichage. */
  export function sleepRemaining(t: SleepTimer, s: { now: number; queue: AudioTrack[]; currentIndex: number; currentTime: number; duration: number }): number;
  /** Chemin JS (Cast, web) : faut-il mettre en pause maintenant ? */
  export function sleepShouldPause(t: SleepTimer, s: { now: number; queue: AudioTrack[]; currentIndex: number }): boolean;
  ```
  - Store : état `sleepTimer: SleepTimer | null` (**hors** `persist.pick`) ; actions `setSleepTimer(mode: SleepMode, minutes?: number)` et `cancelSleepTimer()`, qui appellent `controller?.setSleepTimer(req | null)`.
  - `AudioController.setSleepTimer(req: { mode: SleepMode; minutes?: number } | null): void` et même méthode sur `AudioEngine`.
  - Moteur natif → `NativeAudio.setSleepTimer({ mode: SleepMode | 'off', minutes?: number })` ; écoute `NativeAudio.addListener('sleepTimerFired', …)` → `store.sleepTimer = null`.
  - Moteurs Cast / web : ne font rien eux-mêmes ; `audioPlayerService` évalue `sleepShouldPause` à chaque état reçu quand le moteur actif n'est pas natif, puis `store.togglePlayPause()` vers pause et `sleepTimer = null`.
  - Clés i18n : `audio.sleep.minutes` (« {n} min »), `audio.sleep.endOfTrack` (« Fin du titre »), `audio.sleep.endOfAlbum` (« Fin de l'album »), `audio.sleep.cancel` (« Annuler le minuteur »), `audio.sleep.remaining` (« {time} »).

- [ ] **Step 1: Failing tests** (`sleepTimer.test.ts`) :
  - `minutes` : `endsAt - now` en secondes, jamais négatif.
  - `endOfTrack` : `duration - currentTime`.
  - `endOfAlbum` : reste du titre + durées des titres suivants **contigus** du même `albumId` ; dernier titre de la file → seulement le reste du titre (Review Focus 4).
  - `sleepShouldPause` : `minutes` vrai à `now >= endsAt` ; `endOfTrack` vrai dès que `currentIndex !== armedIndex` ; `endOfAlbum` vrai dès que l'album du titre en cours ≠ album du titre armé.
- [ ] **Step 2:** `npx vitest run src/utils/sleepTimer.test.ts` → FAIL puis implémenter → PASS.
- [ ] **Step 3:** Store, interfaces, moteurs, service, déclaration du plugin TS.
- [ ] **Step 4:** `SleepTimerSheet.vue` (composant `Drawer` existant) : 15/30/45/60, fin du titre, fin de l'album, annuler. Dans le lecteur plein écran, sous le titre : lune (`Moon`) + temps restant (rafraîchi chaque seconde, format de `formatTime`) quand un minuteur est armé ; un tap rouvre la feuille.
- [ ] **Step 5:** `npm test && npm run build` → verts.
- [ ] **Step 6: Commit** `feat(audio): sleep timer UI and Cast/web path`

### Task 7: Minuteur — côté natif

**Files:**
- Create: `android/app/src/main/java/cloud/valgrind/vela/SleepTimer.kt`
- Test: `android/app/src/test/java/cloud/valgrind/vela/SleepTimerTest.kt`
- Modify: `android/app/src/main/java/cloud/valgrind/vela/MusicService.kt`
- Modify: `android/app/src/main/java/cloud/valgrind/vela/NativeAudioPlugin.kt`

**Interfaces:**
- Consumes: appel JS `setSleepTimer({ mode, minutes })` (Task 6).
- Produces:
  - `SleepTimer.kt` (pur, sans Android) :
    ```kotlin
    enum class SleepMode { MINUTES, END_OF_TRACK, END_OF_ALBUM }
    const val SLEEP_FADE_MS = 10_000L
    fun sleepRemainingMs(mode: SleepMode, deadlineMs: Long, nowMs: Long, positionMs: Long, durationMs: Long, lastOfAlbum: Boolean): Long?
    fun sleepVolume(baseVolume: Float, remainingMs: Long): Float  // base * clamp(remaining / SLEEP_FADE_MS, 0, 1)
    fun isLastOfAlbum(currentAlbumId: String?, nextAlbumId: String?): Boolean  // next null ⇒ true
    ```
    `sleepRemainingMs` renvoie `null` quand le minuteur ne vise pas encore ce titre (`END_OF_ALBUM` et pas le dernier de l'album) ; `END_OF_*` avec durée inconnue (≤ 0) → `null`.
  - `MusicService` : constantes `COMMAND_SET_SLEEP_TIMER = "setSleepTimer"`, `COMMAND_SLEEP_TIMER_FIRED = "sleepTimerFired"`. `onConnect` ajoute `setSleepTimer` aux commandes disponibles **seulement** pour un contrôleur de notre paquet (`controller.packageName == packageName`) ; `onCustomCommand` arme / annule. Quand armé : tick `Handler` toutes les 250 ms → `player.volume = sleepVolume(base, remaining)` ; à `remaining <= 0` → `pause()`, volume remis à `base`, `broadcastCustomCommand(sleepTimerFired)`, désarmé. En `END_OF_*`, quand le titre visé est en cours, `player.pauseAtEndOfMediaItems = true` (remis à `false` au désarmement). Annulation ou nouvel armement → volume remis à `base` immédiatement (Review Focus 3). En AirPlay, pas de fondu (sortie locale muette), seulement la pause. `albumId` d'un item : lu dans le JSON `TRACK_EXTRA` de ses extras.
  - `NativeAudioPlugin` : `@PluginMethod setSleepTimer` → `c.sendCustomCommand(SessionCommand(COMMAND_SET_SLEEP_TIMER, Bundle.EMPTY), bundleOf("mode" to mode, "minutes" to minutes))` ; dans `onCustomCommand` du contrôleur, `sleepTimerFired` → `notifyListeners("sleepTimerFired", JSObject())`.

- [ ] **Step 1: Failing tests** `SleepTimerTest` : `MINUTES` → `deadline - now` ; `sleepVolume(0.8f, 5_000)` = `0.4f` ; `sleepVolume(0.8f, 60_000)` = `0.8f` ; `sleepVolume(0.8f, -1)` = `0f` ; `END_OF_ALBUM` non dernier → `null` ; `isLastOfAlbum("a", null)` = `true` ; durée inconnue → `null`.
- [ ] **Step 2:** `./gradlew :app:testDebugUnitTest --tests '*SleepTimerTest'` (dans `android/`, ou via le build Docker) → FAIL puis implémenter → PASS.
- [ ] **Step 3:** Câbler `MusicService` et `NativeAudioPlugin`.
- [ ] **Step 4:** Build APK (Docker, versionCode < 1000). **Vérif appareil** : minuteur 15 min réglé avec `adb shell` horloge ou en passant temporairement une durée courte via devtools (`NativeAudio.setSleepTimer({mode:'minutes', minutes:0.5})`) : fondu audible sur 10 s, pause, volume normal à la reprise ; « fin du titre » écran éteint ; annulation pendant le fondu → volume revient.
- [ ] **Step 5: Commit** `feat(audio): native sleep timer with fade-out`

### Task 8: Fond aux couleurs de la pochette

**Files:**
- Modify: `src/components/ExpandedAudioPlayer.vue`
- Modify: `src/assets/main.css` (utilitaire du voile, thèmes clair/sombre)

**Interfaces:**
- Consumes: `albumArtUrl` existant du lecteur.

- [ ] **Step 1:** Calque `absolute inset-0 -z-10 overflow-hidden pointer-events-none` en premier enfant du lecteur : `<img>` de la pochette `scale-125 object-cover` avec `filter: blur(60px) saturate(1.6)`, puis voile `--audio-player-scrim` (sombre : `rgb(0 0 0 / 0.55)` ; clair : `rgb(255 255 255 / 0.6)`). Changement de titre : `<Transition>` fondu 400 ms, clé = url. Sans pochette ou erreur de chargement : rien (le dégradé `audio-player-bg` reste dessous).
- [ ] **Step 2:** `npm run build` → vert ; `npm run dev`, vérifier dans le navigateur sur une pochette très claire et une très sombre que le titre, l'artiste et le temps restent lisibles (contraste AA, vérifier avec l'outil contraste des devtools).
- [ ] **Step 3: Commit** `feat(audio): blurred cover background in the full-screen player`

### Task 9: Vérification globale et note de session

**Files:**
- Create: `docs/session-progress/2026-11-27-plexamp-lot1.md`

- [ ] **Step 1:** `npm test`, `npm run build`, tests unitaires Android → tout vert ; noter les nombres.
- [ ] **Step 2:** APK sur l'appareil : parcourir les 5 points de la Review Focus et le scénario « radio depuis un titre → laisser tourner jusqu'à la recharge ».
- [ ] **Step 3:** Écrire la note de session (trouvé / changé / vérifié / reste à faire : lots 2 et 3).
- [ ] **Step 4: Commit** `docs: session note for Plexamp lot 1`
