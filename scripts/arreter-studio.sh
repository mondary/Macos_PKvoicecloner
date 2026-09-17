#!/bin/bash
# Arrête uniquement le serveur PK Voice Studio associé à ce projet.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/releases/PK Voice Cloner.app/Contents/MacOS/PKVoiceCloner" --stop
