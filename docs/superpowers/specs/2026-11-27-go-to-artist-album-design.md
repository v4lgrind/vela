# Aller à l'artiste / à l'album — design (petit changement)

## Intention
Retrouver facilement l'artiste d'un album ou d'une musique, et l'album d'une
musique, comme le menu « ⋯ » d'Apple Music. Idée venue de l'état des lieux
Plexamp (2026-11-27).

## Ce qui est construit
- **Musique** (lignes de l'onglet Chansons, pistes d'un album, recherche) :
  le menu « ⋯ » existant (`TrackActionsMenu`) gagne « Aller à l'album » et
  « Aller à l'artiste ». Le même menu s'ouvre aussi par **appui long** sur la
  ligne.
- **Album** (vignettes : onglet Albums, albums d'un artiste, recherche) :
  **appui long** → menu flottant sous le doigt : « Aller à l'artiste »,
  « Lire ensuite », « Ajouter à la file ».
- **Lecteur plein écran** : un bouton « ⋯ » dans l'en-tête → « Aller à
  l'album », « Aller à l'artiste ». Naviguer referme le lecteur.

## Approches envisagées
1. **Menu contextuel Reka UI (`ContextMenu`)** — retenu par l'utilisateur.
   Appui long au toucher et clic droit sur ordinateur gérés par Reka. Même
   style que le menu « ⋯ ».
2. Panneau qui monte du bas (Drawer) + détection d'appui long maison : plus
   d'effort (annulation au défilement, clic à supprimer au relâchement), et
   rien sur ordinateur. Écarté.

## Décisions (mes choix, à corriger si besoin)
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
- Textes en/fr dans i18n.

## Hors périmètre
- Mini-lecteur, rails de l'accueil, page hors ligne (à ajouter plus tard si
  le besoin se confirme).
- Autres actions Apple Music (partager, ajouter à une playlist, j'aime).

## Contraintes
- Le menu ne doit pas bloquer le défilement, et l'appui long ne doit pas
  ouvrir l'album en relâchant le doigt.
- Pas de menu natif du WebView (copier l'image, etc.) sur l'appui long.
- Fonctionne avec Jellyfin et Plex (domaine `src/domain`, pas de SDK dans les pages).

## Laissé au développeur
- Réglage exact du délai d'appui long (défaut Reka : 700 ms).
- Icônes Lucide (`UserRound`, `Disc3`).
