# PK Voice Studio

[🇫🇷 FR](README.md) · [🇬🇧 EN](README_en.md)

version **0.6.0** · macOS Apple Silicon · Apache-2.0

🎙️ **Open source AI voice studio — 100 % local.** Your voice says any text. Powered by [VoxCPM2](https://github.com/OpenBMB/VoxCPM), [dots.tts](https://github.com/studio-dots-ai/dots.tts) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) on Apple Silicon via MPS. **No data ever leaves the machine.**

```sh
curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh
```

## ✅ Features

- **Switchable engines** — **VoxCPM2** (MPS, fast, ~30 languages) and **dots.tts** (2B, high-fidelity 48 kHz cloning, 24 languages): one click in the studio header
- **Models to try** — an **Install** / **Delete** button per optional model (Qwen3-TTS 0.6B, Pocket TTS): weights land in the local cache and any installed model becomes selectable as a generation engine
- **Ultimate cloning** — clip + transcript → timbre, rhythm and style preserved
- **Voice library** — every imported or recorded clip becomes a persistent clone, reusable across sessions: list, preview, select, delete
- **Upload or mic** — QuickTime `.m4a`, `.mp3`, `.wav`, `.webm`, or record straight in the page (guided empty state: import or record)
- **Auto transcription** — Whisper large-v3 (multilingual), editable before generating
- **Speed** 0.75×–1.5× — pure time-stretch, pitch stays untouched
- **On-demand resident model** — loaded once for a session; **Power off** releases its memory when you are done
- **Offline** — models cached locally, no network calls
- **`mavox`** — one-command cloning from the terminal, quoted or not
- **Native macOS app** — embedded window (WKWebView), zero browser: the server starts and stops with the app, automatic Sparkle updates
- **Clean studio** — an ElevenLabs-style clear interface: voices on the left, text and **Generate** on the right, PK coral accent

## 🧠 Usage

1. Open **PK Voice Cloner.app** from the macOS **Applications** folder (path: `/Applications/PK Voice Cloner.app`)
2. On the left: **Import** a clip or **Record** your voice → transcription runs on its own and the clone joins the library
3. Select a voice, type your text on the right, set the speed if needed, **Generate**
4. Listen, download, repeat — clones stay available on next launch
5. At the end of a session, click **Power off** at the top right: the Python server and VoxCPM stop and release their memory.

### Terminal

```sh
./scripts/ma-voix.sh The text your voice should say
./scripts/ma-voix.sh -a ~/Desktop/new_recording.m4a The text

# If the browser is already closed: safely stop the studio and its model
./scripts/arreter-studio.sh
```

## ⚙️ Requirements

- macOS Apple Silicon, 16 GB RAM minimum (32 GB recommended)
- `brew install ffmpeg`
- Models (~5 GB VoxCPM2 + ~3 GB Whisper) download on first launch, then everything is local
- App is not notarized: on first launch from a DMG, right-click → **Open** (once)

## 📦 Build & Run

```sh
# One command
curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh

# By hand
brew install ffmpeg
uv venv .venv && uv venv .venv-whisper
uv pip install --python .venv/bin/python -e third_party/VoxCPM
uv pip install --python .venv-whisper/bin/python faster-whisper
# dots.tts engine (optional) — pynini does not build on macOS, install without it
uv pip install --python .venv/bin/python --no-deps dots-tts
uv pip install --python .venv/bin/python huggingface-hub loguru "langcodes[data]" einops "librosa>=0.11.0" "torchaudio>=2.8" torchdiffeq tqdm lingua-language-detector

# Run the server only
./.venv/bin/python src/server/serveur.py

# Or build the native app (embedded window, no browser) and launch it
./scripts/build.sh
open "build/PK Voice Cloner.app"
```

## 🗂️ Layout

| Path | Role |
|---|---|
| `src/server/` | FastAPI server |
| `web/` | Web studio (`page.html`, `assets/`) |
| `src/macos/PKVoiceCloner.swift` | Native macOS app: WKWebView window, Python server lifecycle, Sparkle |
| `scripts/build.sh` | App build (`swiftc` + bundled Sparkle + icon) |
| `scripts/ma-voix.sh` | Command-line cloning |
| `scripts/arreter-studio.sh` | Safely stops the local server and releases the model |
| `data/voix`, `data/sorties` | Clone library (references + transcripts) and generated audio (private, not versioned) |
| `third_party/VoxCPM` | Model and library (Apache-2.0) |
| `.venv`, `.venv-whisper` | Python environments (not versioned) |
| `web/assets/` | UI logic (`studio.js`) and the legacy MIT Three.js license notice |

## ⚠️ Ethics

Voice cloning must not be used for impersonation. This project is meant for your own voice; a public product should require proof of consent.

## 🔗 Credits

- [VoxCPM / VoxCPM2](https://github.com/OpenBMB/VoxCPM) — OpenBMB, Apache-2.0
- [dots.tts](https://github.com/studio-dots-ai/dots.tts) — dots studio, Apache-2.0
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — SYSTRAN
- [Three.js](https://threejs.org/) — legacy MIT 3D runtime (v0.3), locally distributed
- [ThreeUI Community](https://github.com/MengTo/threeui) — Three.js runtime source and component inspiration, MIT

---

🇫🇷 Voir [README.md](README.md) pour la version française.
