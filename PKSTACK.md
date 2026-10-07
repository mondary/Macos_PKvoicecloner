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
- `app-presence-sync` / `-pk-COMMIT` — conservation de la source EPUB, comparaison synchronisée original/segments, association des rôles à la bibliothèque et génération de segments pour les audiobooks.
- `design-taste-frontend` — espace livre plein écran avec rail chapitres compact et comparaison de phrases alignée ; réglages multi-provider et état par segment.
- `-pk-COMMIT` — version web persistante dans l'en-tête sticky, synchronisée avec le pied de page.
- `design-taste-frontend` — associations de voix codées par couleur, formulaire pleine largeur et contrôles audio explicites générer/lire/régénérer.
- `-pk-COMMIT` — bump CalVer et changelog pour l'écoute continue des segments avec pauses de ponctuation.
- `macos-patterns` / `macos-build` — accès au studio livre dans une fenêtre WKWebView de l'app macOS et reconstruction de l'app.
- `macos-patterns` / `macos-build` — remplacement de la feuille modale par une fenêtre macOS indépendante, redimensionnable et fermable.
+- `macos-menu-and-settings` — fenêtre Réglages native (⚙ en en-tête, ⌘,) : providers IA/clés API, page À propos avec Ko-fi, hub PK et GitHub.
+- `macos-menu-and-settings` — retour des Réglages dans la fenêtre principale (section latérale + ⚙ du header, picker segmenté Clés API / À propos).
+- `macos-menu-and-settings` / `design-taste-frontend` — Réglages épinglés en bas de sidebar, sections empilées Providers IA + Clé Hugging Face + À propos, navigation alignée app/web (Vue d'ensemble → Réglages), section Livres native.
+- `macos-patterns` — WebView du studio sans cache (data store non persistant) + reconnexion automatique : plus d'écran blanc après un redémarrage du serveur local.
+- `laya-integration` / `modeles-partages` — contrôle d'attribution local avec Laya (multilingue 322M, cache HF partagé) : endpoint `/api/livres/{id}/chapitre/{n}/verifier`, surlignage des segments suspects dans la vue comparaison.

## Skills récemment appliquées

- `macos-menu-and-settings` / `macos-build` — menu contextuel de la barre des menus et fond homogène de la page À propos ; compilation native et contrôle visuel.
- `publish-macos-sparkle` / `pk-commits` — livraison des corrections en 2026.10.45-dev, via le workflow Dev et son appcast signé.
- `pk-settings-shell` — statut Stable/Dev comparé aux builds, vérification manuelle rafraîchie et indicateur d’update dans la sidebar.
- `macos-build` — parse Swift effectué ; build complet bloqué par l’absence du plugin de macros SwiftUI dans les Command Line Tools.
- `pk-settings-shell` — fenêtre Réglages native inspirée de PKmonitor : navigation latérale, Providers IA, clé Hugging Face, Project Library, Support/Ko-fi, À propos et canaux Sparkle Stable/Dev.
- `macos-build` — compilation Swift/Sparkle et vérification du bundle natif après ajout de la fenêtre Réglages.
- `-pk-COMMIT` — bump CalVer, synchronisation README FR/EN et CHANGELOG pour le gestionnaire de modèles et les Réglages.
- `pk-settings-shell` — reprise des pages About/Support/Project Library de PKmonitor et réglages de présentation app (icônes Dock et barre des menus).
- `pk-settings-shell` — section Credits dans About, sources utilisées séparées des inspirations; audit des répertoires `vendor/` et sous-modules avant suppression.

## Limites constatées

Le DMG/ZIP v0.6.0 et le cask installent uniquement `PK Voice Cloner.app`. `scripts/build.sh` écrit le chemin du dépôt local dans `Contents/Resources/ProjectRoot.txt`, et `Studio.swift` exige `.venv/bin/python` à la racine du projet. Ils ne forment donc pas une installation autonome sur une autre machine. Un nouveau package intégrant ou provisionnant le serveur et ses dépendances est requis avant d’annoncer DMG/Homebrew comme installables.
