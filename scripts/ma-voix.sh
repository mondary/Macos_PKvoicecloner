#!/bin/bash
# ma-voix.sh — clone ta voix en une commande
# Usage : mavox Tout le texte, même non quoté, devient la synthèse
#         mavox -a clip.m4a le texte  → utilise un autre fichier audio
set -euo pipefail

DIR="$HOME/Documents/GitHub/PROJECTS/Macos_PKvoicecloner"
SRC="$DIR/clement_voice.wav"
if [ "${1:-}" = "-a" ] || [ "${1:-}" = "--audio" ]; then
  SRC="${2:?Fichier audio manquant après -a}"
  shift 2
fi
[ -f "$SRC" ] || { echo "Fichier audio introuvable : $SRC"; exit 1; }
TEXT="$*"
[ -n "${TEXT// /}" ] || { echo "Usage : mavox le texte à synthétiser   (ou : mavox -a fichier.m4a le texte)"; exit 1; }
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$DIR/clones/clone_$STAMP.wav"
mkdir -p "$DIR/clones"

# 1) Conversion WAV 16 kHz mono (VoxCPM ne sait pas lire m4a/mp3)
WAV="$DIR/clones/src_$STAMP.wav"
ffmpeg -y -loglevel error -i "$SRC" -ar 16000 -ac 1 "$WAV"

# 2) Transcription (Whisper large-v3, langue auto) — nécessaire au mode "ultimate"
echo ">> transcription de $(basename "$SRC")..."
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 "$DIR/.venv-whisper/bin/python" - "$WAV" > "$DIR/clones/transcript_$STAMP.txt" <<'EOF'
import sys
from faster_whisper import WhisperModel
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
segs, _ = m.transcribe(sys.argv[1], vad_filter=True)
print(" ".join(s.text.strip() for s in segs))
EOF
echo ">> transcript : $(cat "$DIR/clones/transcript_$STAMP.txt")"

# 3) Clonage ultimate (clip + transcript + référence) — ~2 min par 10 s d'audio
echo ">> génération en cours (MPS)..."
cd "$DIR"
./.venv/bin/voxcpm clone --local-files-only \
  --text "$TEXT" \
  --prompt-audio "$WAV" \
  --prompt-file "$DIR/clones/transcript_$STAMP.txt" \
  --reference-audio "$WAV" \
  --device mps --no-denoiser \
  --output "$OUT"
echo "OK $OUT"
