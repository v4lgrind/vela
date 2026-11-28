# Lot 1 « façon Plexamp » — menus, radio, minuteur, fond — design

## Intention
Reprendre dans le client audio de Vela quelques idées de Plexamp et d'Apple
Music que l'utilisateur aime (état des lieux Plexamp du 2026-11-27).
Le projet est découpé en 3 lots validés par l'utilisateur :

1. **Ce lot** : menu « Aller à l'artiste / l'album », radio, minuteur de
   sommeil, fond aux couleurs de la pochette.
2. Tes tops (artistes / albums / titres les plus écoutés).
3. Le son, en natif : égalisation du volume, puis Sweet Fades (le fondu
   s'appuie sur la mesure de volume ; vérifier d'abord que le serveur
   Jellyfin la calcule).

Chaque lot a son design, est testé sur l'appareil, puis on passe au suivant.

## 1. Menu « Aller à l'artiste / à l'album »
Retrouver facilement l'artiste d'un album ou d'une musique, et l'album d'une
musique, comme le menu « ⋯ » d'Apple Music.

- **Musique** (lignes de l'onglet Chansons, pistes d'un album, recherche) :
  le menu « ⋯ » existant (`TrackActionsMenu`) gagne « Aller à l'album »,
  « Aller à l'artiste » et « Lancer la radio ». Le même menu s'ouvre aussi
  par **appui long** sur la ligne.
- **Album** (vignettes : onglet Albums, albums d'un artiste, recherche) :
  **appui long** → menu flottant sous le doigt : « Aller à l'artiste »,
  « Lancer la radio », « Lire ensuite », « Ajouter à la file ».
- **Lecteur plein écran** : bouton « ⋯ » dans l'en-tête → « Aller à
  l'album », « Aller à l'artiste », « Lancer la radio », « Minuteur ».
  Naviguer referme le lecteur.

### Approches envisagées
1. **Menu contextuel Reka UI (`ContextMenu`)** — retenu par l'utilisateur.
   Appui long au toucher et clic droit sur ordinateur gérés par Reka. Même
   style que le menu « ⋯ ».
2. Panneau qui monte du bas (Drawer) + détection d'appui long maison : plus
   d'effort (annulation au défilement, clic à supprimer au relâchement), et
   rien sur ordinateur. Écarté.

### Décisions (mes choix, l'utilisateur peut corriger)
- Plusieurs artistes (feat.) : une ligne par artiste, « Aller à <nom> ».
  Musique : ses artistes (`track.artists`), sinon ses artistes d'album.
  Album : `album.artists`.
- Une entrée est masquée quand on est déjà sur la page cible (ex. « Aller à
  l'album » sur la page de cet album) ou quand l'id est inconnu.
- La file de lecture (`AudioTrack`) garde désormais les artistes `{id, name}`.
  Pour les files sauvegardées avant ce changement, le menu du lecteur les
  récupère via `catalog.item(trackId)` à l'ouverture (rien si hors ligne).
- Les actions sont décrites une seule fois (composable) et rendues par deux
  enveloppes fines : `DropdownMenu` (bouton « ⋯ ») et `ContextMenu` (appui long).

## 2. Lancer la radio (Plexamp #6)
Une suite de morceaux proches d'un titre, d'un album ou d'un artiste.

- Nouveau `MusicPort.radio(seedId, limit)`.
  - Jellyfin : `GET /Items/{id}/InstantMix` (SDK `getInstantMixApi`). Basé
    sur les genres, pas sur le son : c'est ce que Jellyfin sait faire.
  - Plex : la musique Plex n'est pas encore branchée pour l'utilisateur.
    Le port renvoie `[]`, et l'entrée de menu est masquée quand le backend
    ne sait pas faire de radio (`capabilities`).
- Lancer la radio **remplace la file** et commence par le titre de départ
  (pour un titre) ou par le premier titre du mix (album, artiste).
- Mes choix : 100 titres par lot ; quand il reste ≤ 5 titres, on recharge
  une radio à partir du titre en cours, sans les titres déjà passés, comme
  la lecture aléatoire d'une bibliothèque (`libraryShuffle`). Un drapeau
  `radioSeed` persisté remplace `libraryShuffle` le temps de la radio.
- Hors ligne : entrée masquée.

## 3. Minuteur de sommeil (Plexamp #11)
- Choix : 15, 30, 45, 60 min, **fin du titre**, **fin de l'album**,
  « Annuler ». Le temps restant s'affiche dans le lecteur plein écran
  (petite lune + « 23 min ») ; un tap rouvre le choix.
- Mes choix :
  - Le minuteur vit dans `MusicService.kt` (le WebView peut dormir écran
    éteint) : nouvelle méthode `NativeAudio.setSleepTimer({ mode, minutes })`.
  - Fondu de sortie sur les 10 dernières secondes, puis pause (pas stop :
    la file reste).
  - « Fin de l'album » : pause quand le titre suivant n'a pas le même
    album que le titre en cours (ou fin de file).
  - En Cast, le minuteur tourne côté JS (le Cast ne passe pas par
    `MusicService`). En AirPlay, le natif s'en charge déjà (même ExoPlayer).
  - Le minuteur n'est pas persisté : un redémarrage de l'app l'annule.

## 4. Fond aux couleurs de la pochette (Plexamp #12, « UltraBlur »)
- Le lecteur plein écran affiche la pochette en plein écran derrière le
  contenu, très floutée et saturée, avec un voile sombre (clair en thème
  clair) pour garder le texte lisible (contraste AA).
- Fondu de 400 ms au changement de titre. Sans pochette : le dégradé
  actuel (`--audio-player-bg`).
- Mon choix : CSS (`filter: blur() saturate()` sur une image agrandie),
  pas d'extraction de couleurs. Le mini-lecteur ne change pas.

## Hors périmètre de ce lot
- Mini-lecteur, rails de l'accueil, page hors ligne pour les menus.
- Autres actions Apple Music (partager, playlist, j'aime).
- Radio « sonore » de Plex (analyse du son) : quand Plex musique sera branché.

## Contraintes
- Le menu ne doit pas bloquer le défilement ; l'appui long ne doit pas
  ouvrir l'album au relâchement ; pas de menu natif du WebView (copier
  l'image…) sur l'appui long.
- Pages sans SDK : tout passe par le domaine (`src/domain`), test
  d'architecture vert.
- Textes en/fr dans i18n. Tests unitaires pour la logique (actions du menu,
  recharge de la radio, règle « fin de l'album »).

## Laissé au développeur
- Délai d'appui long (défaut Reka : 700 ms), icônes Lucide.
- Valeurs exactes du flou et du voile.
