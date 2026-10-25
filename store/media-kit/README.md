# Media-kit — captures de PK Reader

## Suivi des analyses (2026.10.78)

`store/screenshots/android-reader/analysis-progress.png` : capture web à 390×844 @2x,
vraie page Réglages et composant `activityView` de production. L’état IA est simulé
(livre « Le voyage de Camille », attribution, 18 lots enregistrés sur 141) ; aucun appel
payant ni donnée personnelle. Contrôle également à 1280×900, et erreur à 360×800.
La pastille flottante est le composant de production ; les transitions file → traitement → succès/échec et reprise sont vérifiées par
`pnpm exec vitest run src/mobile/tests/casting-jobs.test.ts`.

## Capture « Les voix de ce livre » (fiche personnages)

La capture `store/screenshots/android-reader/casting.png` (390×844) montre la
**vraie interface** rendue par le code de production (`openCasting` dans
`src/mobile/casting-ui.ts`), pas une maquette :

1. Générer la page de capture (rend la feuille avec des données fictives —
   lepton de démonstration, voix factices — et y inline `style.css`,
   `reader.css` et les polices de `fonts/`) :

   ```sh
   PK_CASTING_SHOT=1 pnpm exec vitest run src/mobile/tests/capture-casting.test.ts
   ```

   → écrit `store/media-kit/casting-preview.html`.

2. Photographier avec Iris (Chrome headless, 390×844 @1x comme l'original) :

   ```sh
   iris --size 390x844 --scale 1 --wait 500 \
     "file://$PWD/store/media-kit/casting-preview.html" \
     -o store/screenshots/android-reader/casting.png
   ```

Le harnais rend `<dialog open>` en non-modal : la règle
`dialog[open]{position:fixed;inset:0;...}` de la page de capture reproduit le
positionnement modal réel (feuille ancrée en bas). Le premier
« Voir un passage attribué » est ouvert pour montrer la preuve de parole.

## Capture « Réglages » (onglets)

Les trois onglets de la page Réglages (Lecture / Voix & analyse / À propos)
peuvent être rendus hors app : le module `settings-view.ts` est pur.

```sh
PK_SETTINGS_SHOT=1 pnpm exec vitest run src/mobile/tests/capture-settings.test.ts
```

→ écrit `store/media-kit/settings-{lecture,voix,apropos}.html`, prêts pour Iris
(`iris --size 390x844 --scale 1 file://…/settings-lecture.html`).

## Polices

`fonts/` contient les woff2 latins de DM Sans (400/500/600/700) et Literata
(400/500) copiés depuis `node_modules/@fontsource/*` — recopier après une mise à
jour des paquets si nécessaire.

## Données fictives

Le texte de démonstration contient volontairement des leurres (« Voilà : »,
« Exemple : ») pour illustrer qu'une majuscule suivie de deux-points ne crée pas
de personnage, aux côtés de vraies incises (« dit Schaltzmann »).
