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
