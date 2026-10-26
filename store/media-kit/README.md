# Media-kit — captures de PK Reader

## Références lecteur/bibliothèque (2026.10.89)

Même harnais `capture-reader-controls.mjs`, désormais avec trois livres et des
couvertures dessinées pour la démonstration (aucun livre de l’utilisateur). Il
vérifie la recherche, le groupement réel des phrases dans leurs paragraphes,
l’activation d’une phrase au clavier, le suivi après bascule en défilement, puis
« Revenir » après un déplacement manuel. La navigation ne compte que deux
entrées (Bibliothèque, Réglages) et la page des voix s’ouvre depuis Réglages :
une ligne compacte par voix, hauteur contrôlée par le script. Il vérifie aussi le
choix de **1, 2 ou 3 colonnes** (grille recomposée sans rechargement), le **tri**
alpha puis dernier ajout, la **barre de lecture compacte** (hauteur mesurée, cinq
options, transport de sept boutons, pied chapitre/page/pourcentage/temps) et le
**plein écran** qui masque l’en-tête. Captures supplémentaires :
`library-redesign`, `library-3-columns`, `reader-scroll`, `reader-return`, `chapter-voice-review`, `voices`, variantes sombre et bureau.
Le rendu de lecture est celui de `reading-text.ts`, également utilisé pour les
mesures de pagination. Le script attend la disparition des toasts avant capture.

## Centre de notifications (2026.10.88)

`store/screenshots/android-reader/notifications.png` : capture statique du panneau
latéral de production (`notificationDrawer` dans `src/mobile/activity-view.ts`),
avec une analyse en cours, une erreur, un téléchargement à 64 % et une voix installée.

```sh
PK_NOTIFICATIONS_SHOT=1 pnpm exec vitest run src/mobile/tests/capture-notifications.test.ts
iris --size 390x844 --scale 2 --wait 700 \
  "file://$PWD/store/media-kit/notifications-preview.html" \
  -o store/screenshots/android-reader/notifications.png
```

Le fond est la capture `library.png` (assombrie par le voile modal) ; régénérer la
bibliothèque avant le panneau si son interface change. La cloche, la pastille et les
groupes sont aussi couverts par `src/mobile/tests/notifications-view.test.ts`.

## Lecteur, téléchargements et bilan de chapitre (2026.10.80)

Capture/QA reproductible de la vraie app web, en profil Chrome headless isolé :

```sh
pnpm dev --port 5201
PK_QA_URL=http://127.0.0.1:5201/ PK_QA_OUT=/chemin/captures node store/media-kit/capture-reader-controls.mjs
```

Le script vérifie aussi la **barre de lecture compacte** (hauteur mesurée, cinq options, transport de sept boutons, pied chapitre/page/pourcentage/temps), le **plein écran** qui masque l’en-tête, la bascule pages/défilement depuis la barre et l’aperçu sonore avant validation. Il crée un livre fictif, vérifie chapitre/page/phrase et les titres de
repli, puis valide un chapitre avec voix système, passe au suivant sans
redemander et vérifie l’arrêt sur un nouveau personnage. La synthèse est
neutralisée dans le profil de test. Le compteur 28/141 du lecteur est simulé via
le composant de production, pas par une analyse réelle ; le bouton Ko-fi est
vérifié sans ouvrir de page de paiement. Captures 390/320 px et bureau 1280 px, @2x.

Exports : `reader.png`, `chapter-voices.png`, `about-support.png`, `voices.png`,
`notifications.png`, `library-3-columns.png` dans `store/screenshots/android-reader/`. Le test natif `CastingTest` vérifie que les
limites de chapitre empêchent aussi un saut au milieu d’un chapitre non validé.

## Suivi des analyses (2026.10.78)

`store/screenshots/android-reader/analysis-progress.png` : capture web à 390×844 @2x,
vraie page Réglages et composant de suivi de l’époque (remplacé depuis par la cloche et le panneau du 2026.10.88). L’état IA est simulé
(livre « Le voyage de Camille », attribution, 18 lots enregistrés sur 141) ; aucun appel
payant ni donnée personnelle. Contrôle également à 1280×900, et erreur à 360×800.
La pastille flottante était le composant de production à cette date ; les transitions file → traitement → succès/échec et reprise restent vérifiées par
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
