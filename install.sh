#!/bin/sh
# PK Voice Studio — install en une commande
#   curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh
# Variables surchargeables : REPO_URL, DEST
set -eu

REPO_URL="${REPO_URL:-https://github.com/mondary/Macos_PKvoicecloner.git}"
DEST="${DEST:-$HOME/Documents/GitHub/PROJECTS/Macos_PKvoicecloner}"

say() { printf "\033[1;32m==\033[0m %s\n" "$1"; }
die() { printf "\033[1;31mERREUR:\033[0m %s\n" "$1"; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "macOS requis"
[ "$(uname -m)" = "arm64" ] || die "Mac Apple Silicon requis"
command -v git >/dev/null 2>&1 || die "git manquant : xcode-select --install"

if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew manquant — installe-le puis relance :
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
fi
command -v ffmpeg >/dev/null 2>&1 || { say "installation de ffmpeg…"; brew install ffmpeg; }

if ! command -v uv >/dev/null 2>&1; then
  say "installation de uv…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ ! -d "$DEST/.git" ]; then
  say "clonage dans $DEST…"
  mkdir -p "$(dirname "$DEST")"
  git clone "$REPO_URL" "$DEST"
fi
cd "$DEST"

say "création des environnements Python (VoxCPM2 + Whisper)…"
uv venv .venv
uv venv .venv-whisper
uv pip install --python .venv/bin/python -e vendor/VoxCPM
uv pip install --python .venv-whisper/bin/python faster-whisper

say "moteur dots.tts (français haute fidélité, 48 kHz)…"
uv pip install --python .venv/bin/python --no-deps dots-tts
uv pip install --python .venv/bin/python huggingface-hub loguru "langcodes[data]" einops \
  "librosa>=0.11.0" "torchaudio>=2.8" torchdiffeq tqdm lingua-language-detector

say "app native macOS (swiftc + Sparkle)…"
./scripts/build.sh
if [ -d "/Applications/PK Voice Cloner.app" ] || [ -w /Applications ]; then
  rm -rf "/Applications/PK Voice Cloner.app"
  cp -R "build/PK Voice Cloner.app" /Applications/ 2>/dev/null && say "app copiée dans /Applications" || true
fi

say "installation terminée. Lancement :"
printf "  ouvre l'app PK Voice Cloner (Applications) — ou : open \"%s/PK Voice Cloner.app\"\n" "$DEST"
printf "  en app macOS versionnée : brew install --cask pk-voice-cloner\n"
printf "  Les modèles (~5 Go VoxCPM2, ~4 Go dots.tts, ~3 Go Whisper) se téléchargent au premier usage.\n"
