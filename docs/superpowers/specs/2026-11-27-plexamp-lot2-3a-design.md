# Plexamp lot 2 (tops) et lot 3a (égalisation du volume) — design

L'utilisateur a validé le lot 1 sur son téléphone et demandé de continuer le
travail restant sans nouvelle série de questions : les choix ci-dessous sont
les miens (à corriger s'il le souhaite). Sweet Fades (lot 3b) viendra après,
avec son propre design : c'est le seul gros morceau natif.

## Lot 2 — Tes tops (Plexamp « Aural Fixations »)

**Intention :** voir ce qu'on écoute le plus : artistes, albums, titres.

- **Où :** un 5e onglet « Tops » dans une bibliothèque musicale (après
  Playlists). Masqué hors ligne / en mode « Téléchargés » (comme Playlists).
- **Contenu :** trois sections
  - Top artistes : rangée de 10 (image ronde, nom, nombre d'écoutes) ;
  - Top albums : rangée de 10 (pochette, titre, artiste) ;
  - Top titres : liste de 25 (pochette, titre, artiste · écoutes) ; un tap
    joue la liste à partir de ce titre ; ⋯ / appui long = menus du lot 1.
- **Période :** « depuis toujours ». Jellyfin ne garde pas d'historique daté
  sans plugin ; pas de filtre par période.
- **Données :** nouveau `MusicPort.mostPlayed(libraryId, limit)` → titres
  écoutés au moins une fois, par nombre d'écoutes décroissant (500 max).
  - Jellyfin : `/Items` `filters=IsPlayed`, `sortBy=PlayCount` desc.
  - Plex : `/library/sections/{id}/all` `type=10`, `sort=viewCount:desc`,
    `viewCount>=1`.
  - Albums et artistes sont **calculés côté app** en additionnant les écoutes
    des titres (Jellyfin ne compte pas les écoutes d'un album). Artiste =
    premier artiste d'album avec un id (sinon premier artiste du titre).
- **Vide :** message « Rien d'écouté pour l'instant ».
- Fonction pure `musicCharts(tracks)` testée ; composant `MusicCharts.vue`.

## Lot 3a — Égalisation du volume (Plexamp « Loudness leveling »)

**Intention :** tous les titres au même volume perçu.

- **Données :** Jellyfin 10.9+ calcule `NormalizationGain` (dB, cible
  -18 LUFS) par titre. Domaine : `Track.gainDb?: number`, porté dans
  `AudioTrack.gainDb` puis vers le natif. Plex : pas encore (`undefined`).
  Sans valeur, le titre joue tel quel. **À vérifier sur le serveur de
  l'utilisateur** (pas de téléphone connecté au moment du design).
- **Application :** natif, dans la chaîne audio d'ExoPlayer (avant le
  rééchantillonneur et la copie AirPlay, donc AirPlay est aussi égalisé) :
  `GainAudioProcessor` multiplie les échantillons PCM 16 bits par
  `10^((gain + préampli)/20)`, avec écrêtage aux bornes. Préampli
  **-3 dB** fixe pour laisser de la marge aux titres trop faibles ;
  gain final borné à **[-20 dB, +6 dB]**.
- Le gain change au changement de titre (`onMediaItemTransition`, lu dans
  le JSON `TRACK_EXTRA`).
- **Réglage :** Réglages › Musique › « Égaliser le volume » (activé par
  défaut), envoyé au natif (`NativeAudio.setLoudnessLeveling`).
- Cast : non (le récepteur joue l'URL directement). Web : non.
- Tests : maths du gain (Kotlin, JVM) et mapping `NormalizationGain` →
  `gainDb` (vitest).

## Hors périmètre
- Gain d'album (mode « album » de Plexamp), tops par période, Plex gain.
