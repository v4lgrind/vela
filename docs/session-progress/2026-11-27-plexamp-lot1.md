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

- Pixel 10, APK 1.5.2-lot1 (versionCode 1050201, re-signé avec
  `scripts/sign-android-apk.sh` : le téléphone a la clé de release), installé
  par-dessus 1.5.2 en gardant les données. Via adb (`input swipe` immobile
  1,2 s) : appui long sur « (What's The Story) Morning Glory? » → menu « Aller
  à Oasis / Lancer la radio / Lire ensuite / Ajouter à la file », l'album ne
  s'ouvre pas ; « Aller à Oasis » ouvre la page de l'artiste.

- Correctif après test : un « album » de 13 artistes (dossier Explo
  `/music/explo/Daily-Jams`, que Jellyfin prend pour un album « United »)
  faisait déborder le menu. Plus de 3 artistes = pas d'entrée artiste ; les
  menus gardent une marge sous les barres système et défilent.
- **Validé par l'utilisateur sur le Pixel 10** (1.5.2-lot1, code 1050202) :
  appui long, radio, lecteur, minuteur, fond.

## Note serveur (hors Vela)
- Explo dépose chaque playlist dans un dossier de `/music` : Jellyfin en fait
  un faux album qui apparaît sur la page de chaque artiste. À régler côté
  serveur (sortir `explo` de la bibliothèque Musiques + vraie playlist).

## Suite
- PR / merge quand l'utilisateur le demande.
- Lot 2 (tops), lot 3 (égalisation du volume, Sweet Fades).
