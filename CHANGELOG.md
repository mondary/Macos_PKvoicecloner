# Changelog
Keep a Changelog — https://keepachangelog.com

## [2026.10.39] - 2026-10-07

### Changed

- À propos et la sidebar des Réglages affichent une mise à jour disponible selon les numéros de build, comparent correctement les versions CalVer et rafraîchissent les appcasts avant le contrôle manuel.

## [2026.10.38] - 2026-10-07

### Added

- Icône native de barre des menus activée par défaut, avec options indépendantes pour l’affichage dans la barre des menus et le Dock.
- Pages À propos, Support et Project Library rapprochées de la mise en page PKmonitor, avec assets locaux et descriptif centré de l’auteur.
- Section Crédits dans À propos : moteurs/outils effectivement intégrés séparés des inspirations d’interface, avec liens vers leurs projets.

### Changed

- Réglages intégrés à la fenêtre principale ; About, Support et Project Library reprennent la structure PKmonitor.

## [2026.10.36] - 2026-10-07

### Added

- Fenêtre Réglages PK et canaux Stable/Dev Sparkle préparés, avec appcast Dev activable après configuration du secret GitHub `SPARKLE_PRIVATE_KEY`.

## [2026.10.35] - 2026-10-07

### Added

- **Gestionnaire de modèles par famille** : catalogue unifié TTS, speech-to-text et catégorisation, avec installation puis activation depuis le studio web et l'app native. Le choix de transcription est conservé entre les sessions ; Laya rejoint le catalogue de catégorisation.

### Fixed

- Installation de Parakeet Redux dans l'environnement ASR dédié, plutôt que dans celui du serveur TTS.

## [2026.10.34] - 2026-10-07

### Added

- **Parakeet Redux en option pour la transcription** : moteur alternatif à Whisper large-v3, les deux moteurs restent isolés dans l'environnement ASR dédié.

## [2026.10.33] - 2026-10-05

### Added

- **Export audiobook** : « Exporter le chapitre » concatène les segments générés en un WAV unique avec les pauses de ponctuation intégrées (virgule 220 ms, phrase 500 ms) ; « Exporter l'audiobook (M4B) » assemble tous les chapitres générés en un **M4B chapitré** (marqueurs de chapitres, pochette de l'EPUB si présente, titre et auteur en métadonnées), avec progression par chapitre et téléchargement direct. Les chapitres sans audio complet sont listés comme ignorés.

### Fixed

- Test d'analyse interrompue fiabilisé : le thread de reprise n'est plus lancé pour de vrai (il survivait au tearDown et retombait sur un appel réseau bloquant).

## [2026.10.32] - 2026-10-03

### Added

- **Contrôle d'attribution local avec Laya** : nouveau bouton « Vérifier l'attribution (local) » sur un chapitre analysé — un petit modèle embarqué (multilingue 322M, chargé une fois depuis le cache Hugging Face partagé) signale les segments « narrateur » qui contiennent probablement du dialogue. Zéro token, zéro cloud après le premier téléchargement ; les segments suspects sont surlignés dans la vue comparaison avec leur probabilité.

## [2026.10.31] - 2026-10-03

### Fixed

- Le panneau Modèles du studio web marque le moteur actif (« ● Actif ») dès le chargement, sans attendre une réinstallation.

## [2026.10.30] - 2026-10-03

### Changed

- **Panneau Modèles du studio web aligné sur l'app** : les quatre moteurs (VoxCPM2, dots.tts, Qwen3-TTS, Pocket TTS) apparaissent avec leur état — « Actif », bouton Activer, suppression des modèles optionnels et installation.
- **Réglages du studio web** : l'entrée est désormais collée en bas de la barre latérale, juste au-dessus de « Studio personnel ».
- **Liens externes** du studio intégré (Hugging Face, Ko-fi, hub d'applications PK, GitHub) : ils s'ouvrent dans le navigateur par défaut au lieu de rester sans effet.
- La section Livres de l'app affiche les **couvertures** des EPUB.

## [2026.10.29] - 2026-10-03

### Fixed

- **Écran blanc du studio web corrigé** : la fenêtre intégrée de l'app ne met plus le studio en cache (data store non persistant, requêtes sans cache) et retente automatiquement une minute quand le serveur local redémarre — une fenêtre ouverte pendant un arrêt/relance se reconnecte seule au lieu de rester blanche.

## [2026.10.28] - 2026-10-03

### Changed

- **Réglages regroupés, même écran dans l'app et le studio web** : entrée « Réglages » épinglée en bas de la barre latérale (au-dessus de « Studio personnel »), l'app et le web ont les mêmes sections — Providers IA (formulaire pleine largeur), Clé Hugging Face (déplacée depuis Modèles) et À propos (version, Ko-fi, hub PK, GitHub).
- **Navigation alignée** entre l'app native et le studio web : Vue d'ensemble, Bibliothèque de voix, Texte vers voix, Livres, Modèles, Réglages. L'app gagne la section Livres (liste + ouverture du studio dédié) ; « Bibliothèque des textes » devient « Prises générées » et rejoint Texte vers voix.
- Le bouton Réglages quitte le header de l'app ; le dropdown « Réglages IA » disparaît de la page Livres du studio web.

## [2026.10.27] - 2026-10-03

### Changed

- Les Réglages ne sont plus une fenêtre séparée : bouton ⚙ du header et section « Réglages » de la barre latérale affichent Clés API (providers IA) et À propos dans la fenêtre principale de l'app, au style du tableau de bord.

## [2026.10.26] - 2026-10-03

### Added

- **Réglages natifs** : bouton ⚙ dans la barre supérieure de l'app (et menu Réglages… ⌘,) ouvrant une fenêtre complète — gestion des providers IA et de leurs clés API (ajout, modification, test, activation, suppression), page À propos avec version, lien Ko-fi, hub d'applications PK et GitHub.

## [2026.10.25] - 2026-10-03

### Fixed

- Le studio livre s'ouvre dans une vraie fenêtre macOS redimensionnable avec contrôles natifs de fermeture, et non dans une feuille modale trop petite.

## [2026.10.24] - 2026-10-02

### Changed

- Le bouton « Ouvrir le studio web » de l'app macOS ouvre maintenant le studio livre dans une fenêtre intégrée WKWebView au lieu d'envoyer vers Safari.

## [2026.10.23] - 2026-10-02

### Added

- Écoute continue des segments d'un chapitre avec pauses de respiration différenciées selon la ponctuation ; lecture interruptible.

## [2026.10.22] - 2026-10-02

### Changed

- Association des rôles colorée selon le genre de voix, formulaire pleine largeur et bouton d'enregistrement renforcé.
- Contrôles des segments différenciés : « Générer » avant la première synthèse, lecteur audio et « Régénérer » lorsqu'un rendu existe.
- Erreur explicite dans Réglages IA quand l'ancien serveur ne possède pas encore l'API multi-profils.

## [2026.10.21] - 2026-10-02

### Changed

- Version du studio web affichée dans l'en-tête supérieur sticky, visible pendant le défilement et dans la page dédiée d'un livre ; le pied de page conserve également la version.

## [2026.10.20] - 2026-10-02

### Added

- **Providers IA multiples** : ajouter, modifier, tester, activer et supprimer plusieurs profils (endpoint, modèle, clé masquée) ; Ollama local accepte une clé vide et les permissions du fichier de configuration sont limitées au compte courant.
- **Modèle local conseillé** : aide intégrée pour Ollama + Qwen3 4B quantifié, avec endpoint, commande de téléchargement et conseils mémoire/contexte.
- **Page livre plein écran** : navigation latérale masquée dans le livre, liste de chapitres compacte à gauche et lecteur à droite ; le premier chapitre s’ouvre à l’entrée.
- **Statut par chapitre** : état d'analyse, voix détectées, segments détectés et audios générés ; état audio conservé dans le projet pour survivre au rechargement.
- Le post-traitement sépare désormais côté serveur les phrases fusionnées par le modèle pour maintenir une unité audio par phrase.

### Fixed

- Alignement original/segments par similarité de texte : plusieurs phrases source peuvent correspondre à un segment IA fusionné ; les segments vides ne créent plus de fausses lignes/IDs et les phrases source restantes sont signalées explicitement.

## [2026.10.19] - 2026-10-02

### Added

- **Comparaison originale / structure IA** : conservation du texte source à l'import et affichage en deux colonnes synchronisées ; chaque phrase attribuée reçoit son numéro d'ordre dans le chapitre.
- **Attribution des voix et génération par segment** : associer chaque rôle à une voix de la bibliothèque, lancer une phrase seule ou générer le lot séquentiellement ; les WAV prêts restent accessibles par lecteur dans la comparaison.
- Feedback de fin d'analyse avec total de tokens ; progression plus fine par extrait et phase courante affichée. Les réponses OpenAI-compatibles fournissant `usage` alimentent le compteur.

### Changed

- L'analyse demande désormais une phrase par ligne/segment, y compris lorsque plusieurs phrases successives ont le même locuteur.
- Nouveau préfixe propriétaire `///voix` (l'ancien `[voix]` reste accepté en lecture) ; les locuteurs `np1` sont présentés comme « Voix inconnue 1 ».

## [2026.10.18] - 2026-10-02

### Changed

- **Page dédiée par livre** : un clic sur la carte ouvre la page du livre (fil d'Ariane « Livres / titre », bouton retour) — cartouche avec couverture, stats, distribution complète des voix et actions d'analyse ; liste des chapitres avec **état par chapitre** (✓ N voix, en file…, —) et bouton ⚡ individuel ; la zone de dépôt EPUB n'apparaît que sur la liste.
- **Panneau de chapitre à trois modes** : **Coloré** (une ligne par réplique, préfixée par l'orateur — narrateur en vert, hommes en bleu, femmes en rose), **Texte brut** (sans les préfixes) et **Éditer** (correction du texte et des tags, ⌘S, scission). La vue colorée est le mode par défaut d'un chapitre analysé.
- La distribution (cast) s'affiche en entier sur la page du livre ; les liens « Derniers livres » du tableau de bord ouvrent directement la page du livre concerné.

### Fixed

- L'IA écrivant parfois « Narrator » au lieu de « narrateur » : l'identifiant est normalisé (côté serveur pour les prochaines analyses, côté interface pour les chapitres déjà taggés) afin que le narrateur reste un rôle unique, en vert.

## [2026.10.17] - 2026-10-02

### Fixed

- **Analyse coincée « en cours » après un arrêt du studio** : au démarrage du serveur, toute analyse restée `en_cours` est marquée `interrompue` (le fil d'analyse meurt avec le processus) — plus de refus 409 fantôme ; la carte du livre affiche l'état, le pourcentage et un bouton « Continuer l'analyse » qui reprend au premier chapitre non analysé.
- Progression de l'analyse affichée avec pourcentage (`chapitre X/Y · Z %`) et message 409 explicite quand une analyse tourne réellement.

## [2026.10.16] - 2026-10-02

### Added

- **Analyse IA par chapitre, visible directement dans la liste** : chaque ligne de chapitre porte un bouton ⚡ qui lance (ou relance) l'analyse de ce seul chapitre, sans ouvrir l'éditeur.

### Fixed

- Ré-analyser un chapitre précis conserve désormais la distribution des voix existante : elle n'est refaite que lors d'une ré-analyse du livre entier, garantissant des identifiants de voix cohérents d'un chapitre à l'autre.

## [2026.10.15] - 2026-10-02

### Changed

- Vue d'ensemble web recentrée en tableau de bord : tuiles vivantes (voix, modèles installés, livres, prises générées) et panneaux « Derniers livres » / « Dernières prises » avec liens vers les sections — l'éditeur texte et la bibliothèque de voix ne sont plus dupliqués en page d'accueil.
- Vue « Texte vers voix » : liste complète des **prises générées** (nom, durée, extrait du transcript, lecture, téléchargement), absente du studio web jusqu'ici ; rafraîchie automatiquement après chaque génération.

### Fixed

- Réglages IA : l'endpoint accepte désormais l'URL complète (`…/chat/completions`) comme l'URL de base — le suffixe est retiré automatiquement au lieu de produire une URL doublée ; exemples directement adaptés au GLM Coding Plan (`https://api.z.ai/api/coding/paas/v4`) et note explicite « sans /chat/completions ».

## [2026.10.14] - 2026-10-02

### Changed

- Échec d'installation d'un modèle protégé Hugging Face : le message explique la marche à suivre pas à pas (accepter les conditions sur la page du modèle, créer un token Read sur huggingface.co/settings/tokens, le coller dans le studio, réessayer) au lieu du jargon `HF_TOKEN` ; un flag `aide` permet à l'UI d'afficher le guide avec liens cliquables.
- Studio web : bloc « Token Hugging Face — guide pas à pas » dans la section Modèles (champ de saisie + étapes numérotées avec liens) ; l'erreur d'un modèle protégé affiche désormais les 4 étapes avec le lien direct vers SA page Hugging Face.
- App native : les 4 étapes numérotées remplacent l'ancien texte dans le bloc Accès Hugging Face.

## [2026.10.13] - 2026-10-02

### Added

- Jalon 3 des audiobooks : **analyse IA des voix** — panneau Réglages IA du studio (endpoint OpenAI-compatible + clé API + modèle, bouton « Tester la connexion », clé masquée en lecture, stockée dans `data/ia.json`) : GLM, DeepSeek, OpenAI, Ollama local…
- Analyse en deux passes : détection de la **distribution** (narrateur + personnages, genre de voix homme/femme, importance), puis **tagage ligne par ligne** des chapitres (`[voix] texte`) par morceaux d'environ 2 500 caractères.
- **Voix requises par chapitre** et pour tout le livre ; personnages rencontrés en cours de tagage détectés puis classés homme/femme par un appel dédié ; analyse à la demande (livre entier, continuation, ou chapitre seul depuis l'éditeur) et ré-analyse forcée.
- Progression crash-safe (`projet.json` réécrit après chaque chapitre, reprise « Continuer l'analyse (N chap.) ») ; le studio suit en direct : chips ♂/♀ par voix, barre de progression, compteur de voix par chapitre et légende des voix dans l'éditeur.
- Client LLM `src/server/ia.py` en bibliothèque standard (urllib), zéro dépendance pip ; 21 tests avec faux LLM local, aucun appel réseau.

## [2026.10.12] - 2026-10-02

### Fixed

- Build natif sans Xcode complet : `build.sh` teste les SDK disponibles et retombe automatiquement sur les SDK macOS 26 (où `@State` n'est pas une macro) — les Command Line Tools 27 ne livrent pas le plugin de macros `SwiftUIMacros`, ce qui cassait toute compilation SwiftUI.

### Changed

- Vue d’ensemble native recentrée sur les stats (voix, modèles, livres EPUB, confidentialité), l’état et les actions de diagnostic du serveur, la sélection rapide d’une voix, les derniers livres importés et les dernières prises générées ; les bibliothèques et l’éditeur restent uniquement dans leurs sections dédiées.
- Chargement des projets de livres EPUB dans le client SwiftUI pour alimenter le compteur et l’activité récente.

## [2026.10.11] - 2026-10-02

### Changed

- Versions APP et SERVEUR affichées dans la barre fixe supérieure, à côté de l’état du studio et des commandes Démarrer/Éteindre ; l’écart reste signalé en orange, visible sans faire défiler le contenu.

## [2026.10.10] - 2026-10-02

### Added

- Bouton « Ouvrir le studio web » dans la barre de l’app native : ouvre le serveur local déjà démarré (`127.0.0.1:8809`) dans le navigateur par défaut. Désactivé tant que le serveur est éteint.

## [2026.10.9] - 2026-10-02

### Added

- Jalon 2 des audiobooks : **éditeur de chapitres dans le studio** — ouverture d'un chapitre en édition pleine page (titre + texte), état « modifié / enregistré » en temps réel, raccourci ⌘S, garde de fermeture si des modifications ne sont pas enregistrées, brouillons préservés entre re-rendus.
- **Scission de chapitre au curseur** (`POST /api/livres/{id}/chapitre/{n}/scinder`) : coupe un chapitre trop long en deux à la position du curseur, renomme chaque partie, renumérote les chapitres suivants — remède direct aux EPUB au sommaire cassé qui tombent en 2-3 gros blocs.
- Renommage de livre (double-clic sur le titre) et renommage de chapitre via l'éditeur (`POST /api/livres/{id}/renommer`, `titre` optionnel du `PUT` chapitre).
- Durée d'audio estimée (≈ 160 mots/min) affichée par chapitre et par livre.

## [2026.10.8] - 2026-10-02

### Added

- Jalon 1 des audiobooks : **import d'EPUB dans le studio** — dépôt par glisser-déposer ou bouton, découpage automatique chapitre par chapitre (sommaire EPUB3 `nav`, EPUB2 `toc.ncx`, ancres `fichier.xhtml#section`, repli par document du spine quand le sommaire est absent ou cassé), filtrage des pages trop courtes (page de titre, sommaire). Parsage 100 % bibliothèque standard (`zipfile`/`xml`/`html.parser`), zéro dépendance pip.
- Nouveaux endpoints `/api/livres` : import, liste, détail, chapitre en lecture **et** édition (`PUT`), suppression, couverture ; chaque livre vit dans `data/livres/{id}/` (projet.json + `chapitres/NNN.md` + EPUB source conservé pour réanalyse).
- Section « Livres » du studio web : cartes avec couverture, auteur, nombre de chapitres et de mots, lecture du texte de chaque chapitre.

## [2026.10.7] - 2026-10-01

### Changed

- Site store isolé dans `store/website/`, prêt à téléverser par FTP : `index.html` et uniquement ses ressources utilisées, avec chemins relatifs autonomes ; le kit média non utilisé reste dans `store/`.

## [2026.10.6] - 2026-10-01

### Fixed

- « No module named 'voxcpm' » persistant après installation : l'editable Python pointait encore sur `third_party/` (ancien nom avant renommage en `vendor/`) et le bouton Installer posait le paquet PyPI sans réparer ce chemin mort ; l'installation réinstalle désormais le VoxCPM vendored (même commande qu'`install.sh`, `-e vendor/VoxCPM`) et invalide les caches d'import pour que le serveur en cours d'exécution voie le paquet — « Activer » fonctionne alors directement.

### Changed

- Le studio démarre tout seul à l'ouverture de l'app ; éteint, l'écran montre un panneau d'accueil « Le studio est éteint » avec un gros bouton Démarrer (le bouton power de la barre haute est aussi mis en évidence à l'arrêt).
- Après une installation réussie depuis l'app, le moteur s'active automatiquement (suivi en arrière-plan, plus besoin de retoucher « Activer ») ; le CTA d'erreur affiche « Activer » quand tout est déjà installé.

## [2026.10.5] - 2026-10-01

### Added

- Lien « Soutenir sur Ko-fi » toujours visible dans la navigation de la page store (rouge, FR/EN) ; le lien reste aussi présent en pied de page.

## [2026.10.4] - 2026-10-01

### Added

- Version de l'application toujours visible : barre de pied de l'app native et pied du studio web affichent la version réellement exécutée ; l'app signale en orange un écart entre la version du bundle et celle du serveur (`/api/etat` expose désormais `version`).
- Feuille de route du double numérique dans `TODO.md` : clonage vocal rapide, avatar photo → vidéo lipsyncé, studio avatar — moteurs candidats et pièges Mac documentés.

## [2026.10.3] - 2026-10-01

### Added

- Deux variantes d’icône et personnalisations de couleurs de fenêtre pour VS Code.

## [2026.10.2] - 2026-10-01

### Fixed

- Échec de chargement d’un moteur affiché avec un CTA d’installation des dépendances manquantes ; l’installation reste possible lorsque les poids sont déjà en cache.

## [2026.10.0] - 2026-10-01

### Added

- Lien de soutien Ko-fi dans le menu Aide de l’application.

### Changed

- Refonte de la page store en v2 bilingue, responsive et accessible ; installation décrite honnêtement selon les artefacts réellement publiés.
- Vérification de distribution : le DMG et le cask v0.6.0 installent l’app seule, qui dépend encore du dépôt et de son environnement Python ; distribution autonome à traiter avant de promouvoir ces canaux.

- **Fichier `VERSION` supprimé** : la version est lue depuis le dernier en-tête versionné du `CHANGELOG.md` (section `[Unreleased]` ignorée) — une seule source de vérité ; lors d'une release, renommer `[Unreleased]` en `[x.y.z]` avant de lancer `.github/scripts/release.sh`

- **REFACTO arborescence** : le code serveur va dans `src/server/` (`serveur.py`, `transcrire.py`), le studio web dans `web/` (`page.html`, `assets/`) et les scripts dans `scripts/` (`build.sh`, `package_dmg.sh`, `ma-voix.sh`, `arreter-studio.sh`) ; `install.sh` reste à la racine (point d'entrée curl) — chemins mis à jour dans l'app native, les tests et les README, aucun changement fonctionnel
- **Racine nettoyée** : artefacts de release regroupés dans `releases/` (app + DMG/zip), cache Sparkle dans `vendor/` — convention `skill-releases-and-repo-architecture`, clones et sorties CLI réunis dans `data/` (`data/clones`), échantillon vocal perso déplacé en `data/voix/`, icône dans `packaging/`, prototype `index.html` et `.inspi` supprimés
- **Tout le source sous `src/`** : `web/` → `src/web/`, `packaging/` → `src/packaging/`, `tests/` → `src/tests/` ; `third_party/` renommé `vendor/` (VoxCPM). `data/` reste à la racine : contenu généré/privé (voix, clones, logs), pas du code

## [0.6.0] - 2026-09-15

### Added

- **App native macOS** : `PK Voice Cloner.app` en Swift (`swiftc` brut, fenêtre WKWebView) — plus de terminal ni de navigateur ; le serveur Python est un processus enfant démarré au lancement et arrêté gracieusement à la fermeture (modèle libéré), `--stop` conserve le contrat `arreter-studio.sh`, mises à jour automatiques via Sparkle (appcast GitHub)
- **`build.sh`** : build de l'app en une commande (swiftc + Sparkle épinglé/checksumé + icône .icns + signature ad-hoc) ; `install.sh` construit et copie l'app dans /Applications
- **Boutons Installer / Supprimer par modèle** : la liste « Modèles à tester » devient dynamique (`GET /api/modeles`) — « Installer » télécharge les poids (et le paquet pip manquant) en arrière-plan, « Supprimer » purge le cache Hugging Face (refusé si le moteur est chargé en mémoire)
- **Tout modèle installé est sélectionnable** : les moteurs Qwen3-TTS 0,6B et Pocket TTS n'apparaissent dans l'en-tête du studio qu'une fois les poids présents en cache
- **Moteur Pocket TTS (Kyutai)** : clonage vocal léger français (~0,4 Go), chargé sur MPS
- Transcript de secours : la génération réutilise le transcript de la voix sélectionnée si le client n'en envoie pas

### Changed

- **Chatterbox retiré de la liste** : il impose torchaudio==2.6, incompatible avec la venv partagée (dots.tts exige >= 2.8)

## [0.5.0] - 2026-09-14

### Added

- **Deuxième moteur TTS : dots.tts** (2B, clonage haute fidélité 48 kHz, 24 langues) — commutable à la volée depuis l'en-tête du studio ; chargé en float32 sur MPS (~2× plus rapide qu'CPU, bench local : 53 s vs 108 s)
- **Couche moteur** dans le serveur : `POST /api/moteur`, `/api/etat` expose le moteur actif, déchargement mémoire propre entre les moteurs, chargements sérialisés
- **`install.sh`** : installation en une commande `curl -fsSL …/install.sh | sh` (clone, venvs, ffmpeg, uv, dots.tts sans pynini) + tagline « Studio vocal IA open source » dans les README
- Shims d'import dots_tts sur macOS (pynini ne compile pas, garde-fou torch/torchaudio trop strict) : sans effet sur la génération

## [0.4.0] - 2026-09-14

### Added

- **Bibliothèque de voix multi-clones** : chaque clip importé/enregistré devient une voix persistante (`data/voix`), listée, sélectionnable, écoutable et supprimable depuis l'interface
- API bibliothèque : `GET /api/voix`, `POST /api/voix/{id}/choisir`, `GET /api/voix/{id}/wav`, `DELETE /api/voix/{id}` ; l'upload renvoie désormais l'`id` de la voix

### Changed

- **Interface v2** inspirée d'ElevenLabs : hero « Cloner ta voix, sans la livrer. » + panneau studio unique — voix clonées à gauche (état vide avec ajout), texte + **Générer** à droite
- Refonte claire et chaleureuse (papier, corail, serif) ; la page ne charge plus Three.js (scène 3D retirée, ~600 Ko et GPU économisés)

## [0.3.2] - 2026-09-11

### Fixed

- Bundle macOS installé dans `/Applications` avec le nom Finder, Spotlight et Launchpad explicite **PK Voice Cloner**

## [0.3.1] - 2026-09-11

### Added

- Bouton **Éteindre** dans le studio : confirmation, arrêt du serveur local, libération de VoxCPM/MPS et du contexte WebGL
- `POST /api/arreter`, PID suivi dans `data/run/serveur.pid` et `arreter-studio.sh` pour arrêter la session sans navigateur

### Changed

- Le launcher macOS cible exclusivement son serveur vérifié ; arrêt gracieux puis escalade `TERM`/`KILL` seulement si nécessaire

## [0.3.0] - 2026-09-11

### Added

- Studio de voix Three.js réel (r149, runtime local issu de ThreeUI/MIT) : micro de cabine géométrique, panneaux acoustiques, anneaux sonores, particules, éclairage et VU audio-réactifs
- Feuilles de direction à la place du HUD : import/enregistrement, waveform, transcript, script, rythme et rendu WAV
- Design de studio chaleureux (papier, bois, cuivre, lumière de cabine) ; fond et animations produits par `THREE.WebGLRenderer`, non par CSS ou un shader WebGL artisanal

### Changed

- Remplace l'interface « cockpit » v0.2.0 par PK Voice Studio
- Le serveur sert les assets locaux sous `/assets`, dont le runtime Three.js et son avis de licence

## [0.2.0] - 2026-09-11

### Added

- Interface « cockpit » : fond shader WebGL (scanlines CRT, réactif à l'état — veille/enregistrement/génération), consoles à coins biseautés, LEDs d'état (serveur/modèle/voix), horloge
- Cadran de vitesse rotatif (drag + clavier + double-clic = reset 1.00×), estimation du temps affichée avant génération
- Oscilloscopes : forme d'onde de la voix source (décodage Web Audio) et oscilloscope temps réel de la lecture du résultat
- Jauge de progression hachurée pendant la synthèse (RTF estimé ~15 sur MPS)

## [0.1.0] - 2026-09-11

### Added

- Interface web locale : upload (m4a/mp3/wav/webm), enregistrement micro, transcript éditable, vitesse 0,75×–1,5× (pitch préservé), lecture et téléchargement du résultat
- Pipeline : conversion ffmpeg 16 kHz, transcription faster-whisper large-v3, clonage ultimate VoxCPM2 sur MPS (float32), mode offline complet (HF_HUB_OFFLINE)
- Modèle résident en mémoire (une génération ≈ 90 s pour ~6 s d'audio, sans rechargement)
- Transcript persistant par hash audio (pas de 2e transcription au redémarrage)
- `ma-voix.sh` : clonage CLI une commande, texte quoté ou non, option `-a fichier`
- App macOS « PK Voice Cloner.app » : lance le serveur si besoin, ouvre le navigateur
- README FR/EN, VERSION, CHANGELOG, gitignore
