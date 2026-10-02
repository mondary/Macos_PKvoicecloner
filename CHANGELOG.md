# Changelog
Keep a Changelog — https://keepachangelog.com

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
