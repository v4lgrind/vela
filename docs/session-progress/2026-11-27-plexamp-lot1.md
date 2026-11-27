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

---

# Même jour — lot 2 (tops), lot 3a (égalisation), lot 3b (Sweet Fades)

Design : `docs/superpowers/specs/2026-11-27-plexamp-lot2-3a-design.md`
(choix faits par Claude, l'utilisateur ayant demandé de continuer sans
nouvelle série de questions).

## Changements
- **Tops** : onglet « Tops » des bibliothèques musicales (masqué hors ligne).
  `MusicPort.mostPlayed` (Jellyfin `IsPlayed` + `PlayCount`, Plex
  `viewCount:desc`), `musicCharts()` additionne les écoutes par album et par
  artiste, `MusicCharts.vue` (10 artistes, 10 albums, 25 titres).
- **Égalisation du volume** : `Track.gainDb` ← Jellyfin `NormalizationGain`,
  porté par la file jusqu'au natif ; `LoudnessAudioProcessor` en tête de la
  chaîne du sink (avant la copie AirPlay), gain borné [-20 dB, +4 dB].
  Réglages › « Égaliser le volume » (par défaut activé), mémorisé par
  `MusicService` (SharedPreferences `music`). Limite connue : au changement
  de titre, les quelques centaines de ms déjà en tampon gardent l'ancien gain.
- **Sweet Fades** : `CrossfadeController` (second ExoPlayer sans focus audio
  pour la fin du titre sortant, fondu 6 s, rampes en trames dans le
  processeur). Pas de fondu entre titres consécutifs d'un album, en
  répétition « un », avec minuteur, en AirPlay, ou si le titre ne peut pas
  être « seeké » (transcodage à la volée). Réglages › « Fondu entre les
  titres » (par défaut activé).

## Vérifié
- vitest 478 ; tests Kotlin `CrossfadeTest` 6, `LoudnessTest` 6,
  `SleepTimerTest` 7 ; build web ; APK 1.5.2-lot3 (code 1050204) installé
  sur le Pixel 10.

## Pas vérifié
- **Rien n'a été écouté** : fondu, égalisation, onglet Tops sur le vrai serveur.
- Le serveur calcule-t-il `NormalizationGain` ? (requête impossible : téléphone
  en veille). Sans cette valeur, l'égalisation ne fait rien.

## Même soir — en-tête du lecteur, playlists, émulateur
- Lecteur plein écran : en-tête réduit à ˅ / « Lecture en cours » (une ligne)
  / ⋯ ; paroles, AirPlay, Cast et file passent dans une barre en bas.
  Vérifié par capture sur le Pixel 10 (code 1050205).
- Playlists : elles existent (Daily-Jams, Weekly Discovery, créées par
  Explo) et l'onglet Musiques › Playlists les liste ; l'utilisateur ne veut
  rien changer.
- Serveur : Jellyfin 12.4.0 ; `NormalizationGain` sur 276/300 titres ;
  197 titres écoutés (Tops alimentés).
- L'émulateur `vela_phone` démarre maintenant (≈ 3 min, ≈ 3 Go de RAM) ;
  non connecté au serveur (Quick Connect possible si besoin).
- **Sweet Fades retiré** à la demande de l'utilisateur (testé, pas aimé) :
  revert de `3a027c3` ; l'égalisation du volume reste. APK code 1050206.
