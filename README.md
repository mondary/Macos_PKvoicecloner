# PK Voice Cloner

[🇫🇷 FR](README.md) · [🇬🇧 EN](README_en.md)

version **0.2.0** · macOS Apple Silicon · Apache-2.0

🎙️ Clonage de voix 100 % local sur macOS — ton clip + ta transcription, et ta voix dit n'importe quel texte. Basé sur [VoxCPM2](https://github.com/OpenBMB/VoxCPM) (OpenBMB) et [faster-whisper](https://github.com/SYSTRAN/faster-whisper), sur la puce Apple via MPS. **Aucune donnée ne quitte la machine.**

## ✅ Fonctionnalités

- **Clonage ultimate** — clip + transcript → timbre, rythme et style préservés
- **Upload ou micro** — QuickTime `.m4a`, `.mp3`, `.wav`, `.webm`, ou enregistrement direct dans la page
- **Transcription auto** — Whisper large-v3 (multilingue), éditable avant génération
- **Vitesse** 0,75×–1,5× — étirement temporel pur, le pitch reste intact
- **Modèle résident** — chargé une fois, ~90 s par génération ensuite
- **Offline** — modèles en cache local, aucun appel réseau
- **`mavox`** — clone en une commande depuis le terminal, texte quoté ou non

## 🧠 Utilisation

1. Ouvre **PK Voice Cloner.app** (ou `http://127.0.0.1:8809` après lancement)
2. **📁 Choisir un fichier** ou **🎤 Enregistrer** → la transcription apparaît
3. Écris ton texte, règle la vitesse si besoin, **⚡ Générer**
4. Écoute, télécharge, recommence

### Terminal

```sh
./ma-voix.sh Le texte que ta voix doit dire
./ma-voix.sh -a ~/Desktop/nouvel_enregistrement.m4a Le texte
```

## ⚙️ Prérequis

- macOS Apple Silicon, 16 Go de RAM minimum (32 Go recommandé)
- `brew install ffmpeg`
- Les modèles (~5 Go VoxCPM2 + ~3 Go Whisper) se téléchargent au premier lancement, puis tout est local

## 📦 Build & Run

```sh
# Prérequis
brew install ffmpeg
# Les venvs sont créés à la première installe :
uv venv .venv && uv venv .venv-whisper
uv pip install --python .venv/bin/python -e third_party/VoxCPM
uv pip install --python .venv-whisper/bin/python faster-whisper

# Lancer le serveur seul
./.venv/bin/python app/serveur.py

# Ou double-cliquer PK Voice Cloner.app (serveur + navigateur)
```

## 🗂️ Structure

| Chemin | Rôle |
|---|---|
| `app/` | Serveur FastAPI + page web |
| `ma-voix.sh` | Clonage en ligne de commande |
| `data/voix`, `data/sorties` | Clips sources et audios générés (privé, non versionné) |
| `third_party/VoxCPM` | Modèle et bibliothèque (Apache-2.0) |
| `.venv`, `.venv-whisper` | Environnements Python (non versionnés) |

## ⚠️ Éthique

Le clonage de voix est interdit pour l'usurpation d'identité. Ce projet est conçu pour ta propre voix : un produit public devrait exiger une preuve de consentement.

## 🔗 Crédits

- [VoxCPM / VoxCPM2](https://github.com/OpenBMB/VoxCPM) — OpenBMB, Apache-2.0
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — SYSTRAN

---

🇬🇧 See [README_en.md](README_en.md) for English version.
