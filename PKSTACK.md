# PKSTACK

## Skills appliquées

- `premium-promo-media` — refonte v2 bilingue de `store/website/index.html`, récupération honnête des liens d’installation et revue de l’état des assets de présentation. Le site autonome est isolé dans `store/website/` pour téléversement FTP ; assets et captures existants réutilisés, aucune nouvelle capture générée.
- `-pk-COMMIT` — synchronisation des README FR/EN, captures, Ko-fi, notes dans `CHANGELOG.md` et contrôle des canaux de distribution.
- `pk-app-release` / `pkhomebrew` — audit en lecture seule de la release GitHub `v0.6.0`, de ses assets et du cask Homebrew existant ; aucune publication ni modification distante effectuée.
- `macos-build` — vérification de la compilation native après ajout du lien Ko-fi au menu Aide.
- `macos-patterns` — bouton SwiftUI ouvrant le serveur local du studio web dans le navigateur par défaut.
- `app-presence-sync` / `-pk-COMMIT` — README FR/EN, version CalVer et changelog synchronisés pour l’accès au studio web depuis l’app native.
- `macos-build` — build tenté ; bloqué par l’absence de Xcode complet et du plugin de macros SwiftUI dans les Command Line Tools.
- `macos-patterns` — réorganisation native de la Vue d’ensemble : indicateurs de santé/actions, stats et activité récente, sans panneaux de bibliothèque dupliqués.

## Limites constatées

Le DMG/ZIP v0.6.0 et le cask installent uniquement `PK Voice Cloner.app`. `scripts/build.sh` écrit le chemin du dépôt local dans `Contents/Resources/ProjectRoot.txt`, et `Studio.swift` exige `.venv/bin/python` à la racine du projet. Ils ne forment donc pas une installation autonome sur une autre machine. Un nouveau package intégrant ou provisionnant le serveur et ses dépendances est requis avant d’annoncer DMG/Homebrew comme installables.
