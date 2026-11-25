# 2026-11-25 — Pochettes floues sur écran pliable

Branche : `fix/sharp-library-posters` — PR #48.

## Constat

Un utilisateur sur téléphone pliable trouve les pochettes très floues.

Cause : la grille de bibliothèque (`LibraryItemsPage.vue`) demandait au serveur
des affiches de **130×195 px** (carrés 150×150), en pixels « fixes ».
- Sur l'écran intérieur d'un pliable, la grille passe en `auto-fill minmax(150px,1fr)`
  → cellules ~190 px CSS, soit ~500 px physiques à une densité de ~2,6.
- L'image de 130 px était donc agrandie ~4× → flou.
- Même sur un téléphone classique (3 colonnes, ~125 px CSS × 2,6), agrandissement ~2,5×.

Les autres écrans (accueil 300×450, détails 300×450 / 800 / 1920) étaient déjà
dimensionnés large et ne posent pas de problème visible.

## Changements

- `src/utils/imageSize.ts` : `deviceImageSize(cssSize, dpr)` convertit une taille CSS
  en pixels physiques (densité plafonnée à 3×, bord le plus long plafonné à 1920 px,
  ratio conservé). Tests : `src/utils/imageSize.test.ts`.
- `LibraryItemsPage.vue` : affiches `deviceImageSize(200×300)`, carrés `200×200`,
  vignettes de chansons `48×48` (avant : réutilisaient le carré).

Vérifié : `vue-tsc` OK, 423 tests OK. Pas de test sur appareil (pas d'émulateur).

## Reste à faire

- Faire confirmer sur le pliable de l'ami (APK debug ou prochaine release).
- Éventuellement : passer les autres pages (recherche 130×195, accueil, détails)
  sur `deviceImageSize` avec des tailles CSS réelles, pour la cohérence et pour
  éviter de surcharger les petits écrans.

## Suite : correctif généralisé (branche `fix/sharp-artwork-everywhere`)

PR #48 fusionnée. Le correctif est maintenant appliqué partout :
- `useImageUrl()` (`src/composables/useBackend.ts`) passe chaque taille par
  `deviceImageSize()` : toutes les tailles de l'app sont désormais des **pixels CSS**
  (taille affichée), converties en pixels physiques selon la densité de l'écran.
- Tailles remises à la taille réelle affichée : accueil (rails 144×216, cartes 16:9
  208×117), bibliothèques (400×225), détails (saisons/similaires 144×216, albums 260,
  épisodes 180×101, héros 960×540, affiche en héros 640×960, pochette carrée 512,
  casting 110×165), recherche (200×300), personne (112×168 / 200×300),
  hors-ligne (48), mini-lecteur (48), lecteur audio plein écran (280).
- Gros gain : sur la page détail d'un film sans backdrop, l'affiche étirée en
  pleine largeur était demandée en 300×450 → maintenant 640×960 × densité.
- Test : `src/composables/useBackend.test.ts`. 426 tests OK, `vue-tsc` OK.

Non touché (pas lié à l'écran) : artwork de la notification audio
(`audioPlayerService`), affiche du lecteur vidéo et du Cast (image originale),
artwork téléchargé pour le hors-ligne (600 / 960 / 1920 px fixes).
