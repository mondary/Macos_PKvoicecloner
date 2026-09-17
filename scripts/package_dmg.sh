#!/bin/sh
# PK Voice Cloner — DMG d'installation stylée (contrat dmgly : create-dmg + fond GIF animé).
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
APP="$ROOT/build/PK Voice Cloner.app"
STAGE="$ROOT/build/dmg-stage"
DMG="$ROOT/build/PKVoiceCloner-$VERSION.dmg"
BACKGROUND="$ROOT/packaging/dmg-background.gif"

"$ROOT/scripts/build.sh"
rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/PK Voice Cloner.app"

if command -v create-dmg >/dev/null 2>&1 && [ -f "$BACKGROUND" ]; then
  if ! create-dmg \
      --volname "PK Voice Cloner $VERSION" \
      --window-size 660 400 \
      --icon-size 128 \
      --icon "PK Voice Cloner.app" 180 170 \
      --app-drop-link 480 170 \
      --hide-extension "PK Voice Cloner.app" \
      --background "$BACKGROUND" \
      "$DMG" "$STAGE"; then
    rm -f "$DMG"
    hdiutil create -volname "PK Voice Cloner $VERSION" -srcfolder "$STAGE" \
      -format UDZO -imagekey zlib-level=9 "$DMG"
  fi
else
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "PK Voice Cloner $VERSION" -srcfolder "$STAGE" \
    -format UDZO -imagekey zlib-level=9 "$DMG"
fi

rm -rf "$STAGE"
echo "Built $DMG"
