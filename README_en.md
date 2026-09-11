# PK Voice Studio

[🇫🇷 FR](README.md) · [🇬🇧 EN](README_en.md)

version **0.3.2** · macOS Apple Silicon · Apache-2.0

🎙️ 100 % local voice cloning on macOS — your clip + its transcript, and your voice says any text. Powered by [VoxCPM2](https://github.com/OpenBMB/VoxCPM) (OpenBMB) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) on Apple Silicon via MPS. **No data ever leaves the machine.**

## ✅ Features

- **Ultimate cloning** — clip + transcript → timbre, rhythm and style preserved
- **Upload or mic** — QuickTime `.m4a`, `.mp3`, `.wav`, `.webm`, or record straight in the page
- **Auto transcription** — Whisper large-v3 (multilingual), editable before generating
- **Speed** 0.75×–1.5× — pure time-stretch, pitch stays untouched
- **On-demand resident model** — loaded once for a session; **Power off** releases its memory when you are done
- **Offline** — models cached locally, no network calls
- **`mavox`** — one-command cloning from the terminal, quoted or not
- **Three.js studio** — a real audio-reactive 3D scene: booth microphone, acoustic panels, particles, sound rings, lighting and VU meter
- **Take direction** — a singer/voice-actor workflow: source, transcript, script, pace, render and WAV master in one space

## 🧠 Usage

1. Open **PK Voice Cloner.app** from the macOS **Applications** folder (path: `/Applications/PK Voice Cloner.app`)
2. **📁 Choose a file** or **🎤 Record** → the transcript shows up
3. Type your text, set the speed, **Create take**
4. Listen, download, repeat
5. At the end of a session, click **Power off** at the top right: the Python server, VoxCPM and Three.js renderer stop and release their memory.

### Terminal

```sh
./ma-voix.sh The text your voice should say
./ma-voix.sh -a ~/Desktop/new_recording.m4a The text

# If the browser is already closed: safely stop the studio and its model
./arreter-studio.sh
```

## ⚙️ Requirements

- macOS Apple Silicon, 16 GB RAM minimum (32 GB recommended)
- `brew install ffmpeg`
- Models (~5 GB VoxCPM2 + ~3 GB Whisper) download on first launch, then everything is local

## 📦 Build & Run

```sh
# Prerequisites
brew install ffmpeg
# Venvs are created on first install:
uv venv .venv && uv venv .venv-whisper
uv pip install --python .venv/bin/python -e third_party/VoxCPM
uv pip install --python .venv-whisper/bin/python faster-whisper

# Run the server only
./.venv/bin/python app/serveur.py

# Or double-click PK Voice Cloner.app (server + browser)
```

## 🗂️ Layout

| Path | Role |
|---|---|
| `app/` | FastAPI server + web page |
| `ma-voix.sh` | Command-line cloning |
| `arreter-studio.sh` | Safely stops the local server and releases the model |
| `data/voix`, `data/sorties` | Source clips and generated audio (private, not versioned) |
| `third_party/VoxCPM` | Model and library (Apache-2.0) |
| `.venv`, `.venv-whisper` | Python environments (not versioned) |
| `app/assets/` | Local Three.js runtime, studio scene and MIT license notice |

## ⚠️ Ethics

Voice cloning must not be used for impersonation. This project is meant for your own voice; a public product should require proof of consent.

## 🔗 Credits

- [VoxCPM / VoxCPM2](https://github.com/OpenBMB/VoxCPM) — OpenBMB, Apache-2.0
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — SYSTRAN
- [Three.js](https://threejs.org/) — locally distributed MIT 3D runtime
- [ThreeUI Community](https://github.com/MengTo/threeui) — Three.js runtime source and component inspiration, MIT

---

🇫🇷 Voir [README.md](README.md) pour la version française.
