# PK Voice Studio

[🇫🇷 FR](README.md) · [🇬🇧 EN](README_en.md)

version **0.6.0** · macOS Apple Silicon · Apache-2.0

🎙️ **Studio vocal IA open source — 100 % local.** Ta voix dit n'importe quel texte. Basé sur [VoxCPM2](https://github.com/OpenBMB/VoxCPM), [dots.tts](https://github.com/studio-dots-ai/dots.tts) et [faster-whisper](https://github.com/SYSTRAN/faster-whisper), sur la puce Apple via MPS. **Aucune donnée ne quitte la machine.**

```sh
curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh
```

## ✅ Fonctionnalités

- **Moteurs commutables** — **VoxCPM2** (MPS, rapide, ~30 langues) et **dots.tts** (2B, clonage haute fidélité 48 kHz, 24 langues) : un clic dans l'en-tête du studio
- **Modèles à tester** — bouton **Installer** / **Supprimer** pour chaque modèle optionnel (Qwen3-TTS 0,6B, Pocket TTS) : les poids rejoignent le cache local et tout modèle installé devient sélectionnable comme moteur de génération
- **Clonage ultimate** — clip + transcript → timbre, rythme et style préservés
- **Bibliothèque de voix** — chaque clip importé ou enregistré devient un clone persistant, réutilisable d'une session à l'autre : liste, écoute, sélection, suppression
- **Upload ou micro** — QuickTime `.m4a`, `.mp3`, `.wav`, `.webm`, ou enregistrement direct dans la page (état vide guidé : importer ou s'enregistrer)
- **Transcription auto** — Whisper large-v3 (multilingue), éditable avant génération
- **Vitesse** 0,75×–1,5× — étirement temporel pur, le pitch reste intact
- **Modèle résident, à la demande** — chargé une fois pendant la session ; **Éteindre** libère sa mémoire dès que tu as fini
- **Offline** — modèles en cache local, aucun appel réseau
- **`mavox`** — clone en une commande depuis le terminal, texte quoté ou non
- **App native macOS** — fenêtre intégrée (WKWebView), zéro navigateur : le serveur démarre et s'arrête avec l'app, mises à jour automatiques via Sparkle
- **Studio épuré** — interface claire façon ElevenLabs : voix à gauche, texte et **Générer** à droite, accent corail PK

## 🧠 Utilisation

1. Ouvre **PK Voice Cloner.app** depuis le dossier macOS **Applications** (chemin : `/Applications/PK Voice Cloner.app`)
2. À gauche : **Importer** un clip ou **Enregistrer** ta voix → la transcription part toute seule et le clone rejoint la bibliothèque
3. Sélectionne une voix, écris ton texte à droite, règle la vitesse si besoin, **Générer**
4. Écoute, télécharge, recommence — les clones restent disponibles au prochain lancement
5. Quand la session est terminée, clique **Éteindre** en haut à droite : le serveur Python et VoxCPM sont arrêtés et leur mémoire est libérée.

### Terminal

```sh
./ma-voix.sh Le texte que ta voix doit dire
./ma-voix.sh -a ~/Desktop/nouvel_enregistrement.m4a Le texte

# Si le navigateur est déjà fermé : arrêt sûr du studio et de son modèle
./arreter-studio.sh
```

## ⚙️ Prérequis

- macOS Apple Silicon, 16 Go de RAM minimum (32 Go recommandé)
- `brew install ffmpeg`
- Les modèles (~5 Go VoxCPM2 + ~3 Go Whisper) se téléchargent au premier lancement, puis tout est local
- App non notarisée : au premier lancement depuis un DMG, clic droit → **Ouvrir** (une seule fois)

## 📦 Build & Run

```sh
# En une commande
curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh

# À la main
brew install ffmpeg
uv venv .venv && uv venv .venv-whisper
uv pip install --python .venv/bin/python -e third_party/VoxCPM
uv pip install --python .venv-whisper/bin/python faster-whisper
# moteur dots.tts (optionnel) — pynini ne compile pas sur macOS, on l'installe sans
uv pip install --python .venv/bin/python --no-deps dots-tts
uv pip install --python .venv/bin/python huggingface-hub loguru "langcodes[data]" einops "librosa>=0.11.0" "torchaudio>=2.8" torchdiffeq tqdm lingua-language-detector

# Lancer le serveur seul
./.venv/bin/python app/serveur.py

# Ou construire l'app native (fenêtre intégrée, pas de navigateur) puis la lancer
./build.sh
open "PK Voice Cloner.app"
```

## 🗂️ Structure

| Chemin | Rôle |
|---|---|
| `app/` | Serveur FastAPI + page web |
| `src/macos/PKVoiceCloner.swift` | App native macOS : fenêtre WKWebView, cycle de vie du serveur Python, Sparkle |
| `build.sh` | Build de l'app (`swiftc` + Sparkle embarqué + icône) |
| `ma-voix.sh` | Clonage en ligne de commande |
| `arreter-studio.sh` | Arrêt sûr du serveur local et libération du modèle |
| `data/voix`, `data/sorties` | Bibliothèque de clones (références + transcripts) et audios générés (privé, non versionné) |
| `third_party/VoxCPM` | Modèle et bibliothèque (Apache-2.0) |
| `.venv`, `.venv-whisper` | Environnements Python (non versionnés) |
| `app/assets/` | Logique d'interface (`studio.js`) et licence MIT du runtime Three.js historique |

## ⚠️ Éthique

Le clonage de voix est interdit pour l'usurpation d'identité. Ce projet est conçu pour ta propre voix : un produit public devrait exiger une preuve de consentement.

## 🔗 Crédits

- [VoxCPM / VoxCPM2](https://github.com/OpenBMB/VoxCPM) — OpenBMB, Apache-2.0
- [dots.tts](https://github.com/studio-dots-ai/dots.tts) — dots studio, Apache-2.0
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — SYSTRAN
- [Three.js](https://threejs.org/) — runtime 3D MIT historique (v0.3), distribué localement
- [ThreeUI Community](https://github.com/MengTo/threeui) — source du runtime Three.js et inspiration des composants, MIT

---

🇬🇧 See [README_en.md](README_en.md) for English version.
