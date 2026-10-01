# Changelog
Keep a Changelog — https://keepachangelog.com

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
