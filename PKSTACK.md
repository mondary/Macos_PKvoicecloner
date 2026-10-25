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

- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.82 : voix française Kokoro int8 intégrée au moteur sherpa-onnx existant (empreinte vérifiée, mémoire maîtrisée), aperçu sonore corrigé et navigation réduite sur une ligne.
- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.81 : aperçu sonore par association dans le bilan de chapitre, mini-lecteur par défaut (plusieurs paragraphes par page), repagination liée à la hauteur du lecteur et bascule pages/défilement dans le lecteur. QA navigatrice étendue.
- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.80 : suivi fixe partagé des téléchargements (installation manuelle ou automatique), bouton Ko-fi nommé, navigation chapitre/page/phrase regroupée et titres génériques réparés. Tests de suivi et de commandes, captures de démonstration.
- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.79 : page « Gérer le livre » en quatre étapes (paragraphes, analyse, voix, écoute) avec pourcentages, états et relance ciblée ou globale. Tests et documentation synchronisés.
- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.78 : pastille de suivi compacte, relecture IA conditionnelle, sous-lots de 60, casting plafonné et fournisseur IA locale (Ollama, LM Studio, llama.cpp) avec disclaimers. Tests et captures synchronisés.
- `fixing-accessibility` / `app-presence-sync` / `-pk-COMMIT` — PK Reader 2026.10.76 : suivi d’analyse partagé, progression réelle des lots, erreurs persistantes dans la session, région live et conservation du focus des formulaires ; documentation FR/EN.
- `nosdk-cloud-builds` / `app-presence-sync` / `fixing-accessibility` / `premium-promo-media` / `pk-commits` — PK Reader 2026.10.64 à 2026.10.67 : repérage de locuteurs fondé sur des indices de parole, analyse IA autonome sur le téléphone (fournisseur OpenAI-compatible, clé Android Keystore, trois passes par lots de 40), séquence « Préparer le livre audio » en un bouton, menu du livre accessible depuis le lecteur, dix voix françaises Piper (dont Siwis légère 13 Mo). Build Android via GitHub Actions.
- `capacitor-pnpm-setup` / `frontend-design` / `pk-commits` — PK Reader 2026.10.61 à 2026.10.63 : clé de signature Android permanente (secrets GitHub + sauvegarde locale), mise à jour intégrée (vérification GitHub, SHA-256, signature, installateur), correction du rafraîchissement de la page Réglages, et distribution limitée aux personnages qui ont une réplique (fini les 168 voix issues de simples mentions). Documentation et landing alignées ; une dernière réinstallation est nécessaire pour les versions ≤ 2026.10.60.
- `fixing-accessibility` / `app-presence-sync` / `premium-promo-media` / `-pk-COMMIT` — Android 2026.10.59 : préparation automatique des personnages, propositions et téléchargements de voix, contrôles nommés et corrections repliées ; documentation FR/EN et landing synchronisées. Studio 2026.10.67 : identités et contexte conservés entre lots.
- `ego-browser` / `ego-browser-user-policy` / `macos-build` — contrôle du parcours mobile dans un TaskSpace isolé, capture de la vraie interface web avec texte de démonstration et build Dev du studio via le script du projet.
- `capacitor-pnpm-setup` / `frontend-design` / `nosdk-cloud-builds` — PK Reader Android : interface originale dans `src/mobile`, service de lecture natif, modèles Piper, passerelle mobile et APK/test émulateur GitHub Actions. Version Android suivie séparément dans `src/mobile/CHANGELOG.md`.
- `ego-browser` / `ego-browser-user-policy` — références Readexa et contrôle de l’interface mobile dans un TaskSpace isolé.
- `pk-commits` — commits Android ciblés, documentation et version CalVer mobile.
- `macos-menu-and-settings` / `macos-build` / `pk-commits` — coordination de la fenêtre SwiftUI du studio : réouverture après fermeture, restauration après minimisation et conservation des demandes Réglages/À propos/mises à jour, en 2026.10.46-dev.
- `pk-app-release` / `publish-macos-sparkle` / `pkhomebrew` / `dmgly-dmg-install` — promotion de la version Dev validée en Stable 2026.10.45, archives signées, DMG, installateur, appcast et cask synchronisés.
- `macos-menu-and-settings` / `macos-build` — menu contextuel de la barre des menus et fond homogène de la page À propos ; compilation native et contrôle visuel.
- `publish-macos-sparkle` / `pk-commits` — livraison des corrections en 2026.10.45-dev, via le workflow Dev et son appcast signé.
- `pk-settings-shell` — statut Stable/Dev comparé aux builds, vérification manuelle rafraîchie et indicateur d’update dans la sidebar.
- `macos-build` — parse Swift effectué ; build complet bloqué par l’absence du plugin de macros SwiftUI dans les Command Line Tools.
- `pk-settings-shell` — fenêtre Réglages native inspirée de PKmonitor : navigation latérale, Providers IA, clé Hugging Face, Project Library, Support/Ko-fi, À propos et canaux Sparkle Stable/Dev.
- `macos-build` — compilation Swift/Sparkle et vérification du bundle natif après ajout de la fenêtre Réglages.
- `-pk-COMMIT` — bump CalVer, synchronisation README FR/EN et CHANGELOG pour le gestionnaire de modèles et les Réglages.
- `pk-settings-shell` — reprise des pages About/Support/Project Library de PKmonitor et réglages de présentation app (icônes Dock et barre des menus).
- `pk-settings-shell` — section Credits dans About, sources utilisées séparées des inspirations; audit des répertoires `vendor/` et sous-modules avant suppression.

- `capacitor-pnpm-setup` / `-pk-COMMIT` — PK Reader : une voix par personnage (rôles, pitch, vitesse, attribution des passages, suggestions locales), SpeechProfile natif et modèles Piper co-résidents ; APK `pk-2026.10.53` publié par le workflow.
- `-pk-COMMIT` / `frontend-design` / `macos-build` — studio : lecture au fil de l'eau (`/api/lire`, WAV par phrase, arrêt), cache de voix du clonage réutilisé, bouton **Lire** dans le studio web (texte libre et chapitre en direct) et dans l'app native, garde anti-double chargement du modèle ; mesures dans `scripts/bench-voxcpm.py` (Piper 0,13 s/phrase, VoxCPM2 ~7 s/phrase, RTF ≈ 2,3, cache de voix 6,8 s).

## Limites constatées

- Le `.venv` et `vendor/` du studio étaient absents le 18/10 à 23 h (studio injoignable, `vendor/sparkle` compris) : reconstruits via `install.sh` — VoxCPM vendoré (`cce58a5`), `piper-tts`, `dots-tts`, torch 2.14.1 MPS. Un second chargement du même moteur sur MPS faisait tomber le serveur (assertion Metal) : corrigé et couvert par les tests.
- Pocket TTS (kyutai) a été écarté de la lecture live : son clonage de voix est protégé sur Hugging Face (acceptation des conditions + `hf auth login` requis) ; ses voix de catalogue ne sont pas celles de l’utilisateur. Le moteur de clonage reste VoxCPM2 (RTF ≈ 2,3 mesuré sur M5, cache de voix inclus).

Le DMG/ZIP v0.6.0 et le cask installent uniquement `PK Voice Cloner.app`. `scripts/build.sh` écrit le chemin du dépôt local dans `Contents/Resources/ProjectRoot.txt`, et `Studio.swift` exige `.venv/bin/python` à la racine du projet. Ils ne forment donc pas une installation autonome sur une autre machine. Un nouveau package intégrant ou provisionnant le serveur et ses dépendances est requis avant d’annoncer DMG/Homebrew comme installables.
