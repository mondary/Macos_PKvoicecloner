# Changelog
Keep a Changelog — https://keepachangelog.com

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
