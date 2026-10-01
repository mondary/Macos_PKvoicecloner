# PKSTACK

## Skills appliquées

- `premium-promo-media` — refonte v2 bilingue de `store/home.html`, récupération honnête des liens d’installation et revue de l’état des assets de présentation. Assets et captures existants réutilisés ; aucune nouvelle capture n’a été générée.
- `-pk-COMMIT` — synchronisation des README FR/EN, captures, Ko-fi, notes dans `CHANGELOG.md` et contrôle des canaux de distribution.
- `pk-app-release` / `pkhomebrew` — audit en lecture seule de la release GitHub `v0.6.0`, de ses assets et du cask Homebrew existant ; aucune publication ni modification distante effectuée.
- `macos-build` — vérification de la compilation native après ajout du lien Ko-fi au menu Aide.

## Limites constatées

Le DMG/ZIP v0.6.0 et le cask installent uniquement `PK Voice Cloner.app`. `scripts/build.sh` écrit le chemin du dépôt local dans `Contents/Resources/ProjectRoot.txt`, et `Studio.swift` exige `.venv/bin/python` à la racine du projet. Ils ne forment donc pas une installation autonome sur une autre machine. Un nouveau package intégrant ou provisionnant le serveur et ses dépendances est requis avant d’annoncer DMG/Homebrew comme installables.
