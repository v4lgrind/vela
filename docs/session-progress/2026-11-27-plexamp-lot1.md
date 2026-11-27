# 2026-11-27 — Plexamp lot 1: menus « Aller à », radio, minuteur, fond flouté

## Contexte
- État des lieux de Plexamp fait avec l'utilisateur. Sélection : menus « Aller à
  l'artiste / l'album » (façon Apple Music), radio (#6), minuteur de sommeil
  (#11), fond aux couleurs de la pochette (#12), tops (#15), égalisation du
  volume (#1), Sweet Fades (#2).
- Découpage validé en 3 lots : **lot 1** (ce travail), lot 2 = tops, lot 3 = son
  natif (égalisation puis Sweet Fades ; vérifier d'abord que le serveur
  Jellyfin calcule `NormalizationGain` — les fixtures n'en ont pas).
- Design : `docs/superpowers/specs/2026-11-27-plexamp-lot1-design.md`
- Plan : `docs/superpowers/plans/2026-11-27-plexamp-lot1.md`

## Changements (branche `v4lgrind/plex-amp-rea`, non poussée)
- `AudioTrack.artists` ; les files sauvegardées avant reçoivent artistes +
  pochette au démarrage (`backfillQueueDetails`, `withServerDetails`).
- `src/utils/musicActions.ts` : quelles entrées montrer (aller à l'album, à
  chaque artiste, radio, lire ensuite, ajouter à la file), masquées sur la
  page cible, radio masquée hors ligne / si le backend ne sait pas.
- `useMusicActions` + `components/music/` : `MusicContextMenu` (appui long /
  clic droit, Reka `ContextMenu`, le clic au relâchement est avalé),
  `NowPlayingMenu` (⋯ du lecteur plein écran), `SleepTimerSheet`.
  `TrackActionsMenu` gagne les entrées « aller à » + radio.
  Branché : onglet Chansons, grille et liste d'albums, pistes et albums de
  la page album/artiste, recherche (titres + albums), lecteur plein écran.
- Radio : `MusicPort.radio` (Jellyfin `/Items/{id}/InstantMix`, Plex `[]`),
  `Capabilities.radio`, `store.playRadio` / `radioSeed` (persisté), recharge
  de 100 titres depuis le titre en cours quand il en reste ≤ 5.
- Minuteur : 15/30/45/60 min, fin du titre, fin de l'album. Natif dans
  `MusicService` (`SleepTimer.kt`, commande de session `setSleepTimer`
  réservée au paquet de l'app, fondu 10 s, `pauseAtEndOfMediaItems`,
  événement `sleepTimerFired`). Cast / web : `audioPlayerService` sur les
  états du moteur (`ownsSleepTimer`). Non persisté.
- Fond : pochette floutée + voile (`--audio-player-art-filter`,
  `--audio-player-scrim`), contraste text-muted ≥ 4,5:1 calculé au pire cas.

## Vérifié
- `npx vitest run` : 467 tests verts ; `npm run build` OK ;
  `./gradlew :app:testDebugUnitTest` vert (dont `SleepTimerTest`, 7 tests).
- APK debug construit localement (versionCode 40) :
  `android/app/build/outputs/apk/debug/vela.apk`.

## Pas encore vérifié (aucun appareil branché pendant la session)
1. Appui long sur une vignette d'album : le menu s'ouvre, relâcher n'ouvre pas
   l'album, le défilement reste fluide. **Risque** : Reka annule l'appui long
   au moindre `pointermove` — à vérifier au doigt.
2. Radio : lancer depuis un titre, un album, un artiste ; laisser tourner
   jusqu'à la recharge.
3. Minuteur natif : fondu audible, pause, volume normal à la reprise ; fin du
   titre écran éteint ; annulation pendant le fondu.
4. Fond flouté sur une pochette très claire et une très sombre.
5. Ancienne file (sans artistes) : l'entrée artiste apparaît après redémarrage.

## Suite
- Tests appareil ci-dessus, puis PR / merge quand l'utilisateur le demande.
- Lot 2 (tops), lot 3 (égalisation du volume, Sweet Fades).
