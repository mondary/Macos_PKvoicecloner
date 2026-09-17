#!/bin/bash
# Publie une release PK Voice Cloner avec Sparkle :
#   1. Build de l'app + DMG stylé
#   2. Zip signé EdDSA (l'app vérifie SUPublicEDKey avant d'installer)
#   3. Génération de appcast.xml (lu par l'app pour détecter les MAJ)
#   4. Publication : commit de l'appcast + GitHub Release (zip + dmg)
#
# Usage : ./.github/scripts/release.sh            (version = dernier en-tête versionné du CHANGELOG.md)
#         ./.github/scripts/release.sh 0.7.0      (version explicite)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

VERSION="${1:-$(sed -nE 's/^## \[([^]]+)\].*/\1/p' CHANGELOG.md | grep -v Unreleased | head -1)}"
TAG="v${VERSION}"
ZIP_NAME="PKVoiceCloner-${VERSION}.zip"
DMG_NAME="PKVoiceCloner-${VERSION}.dmg"
SIGN_UPDATE="build/sparkle/bin/sign_update"

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI requis : brew install gh" >&2
  exit 1
fi

echo "🔨 Build v${VERSION}…"
./scripts/package_dmg.sh

echo "📦 Zip de l'app (contrat Sparkle : ditto préserve symlinks et permissions)…"
rm -f "build/${ZIP_NAME}"
ditto -c -k --keepParent "build/PK Voice Cloner.app" "build/${ZIP_NAME}"

echo "✍️  Signature EdDSA…"
SIG=$("$SIGN_UPDATE" "build/${ZIP_NAME}" | sed -E 's/.*edSignature="([^"]+)".*/\1/')
LEN=$(stat -f%z "build/${ZIP_NAME}")
PUB_DATE="$(date -u '+%a, %d %b %Y %H:%M:%S %z')"

cat > appcast.xml << EOF
<?xml version="1.0" standalone="yes"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
    <channel>
        <title>PK Voice Cloner</title>
        <link>https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast.xml</link>
        <description>Dernières mises à jour de PK Voice Cloner</description>
        <language>fr</language>
        <item>
            <title>Version ${VERSION}</title>
            <pubDate>${PUB_DATE}</pubDate>
            <sparkle:version>${VERSION}</sparkle:version>
            <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
            <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
            <enclosure
                url="https://github.com/mondary/Macos_PKvoicecloner/releases/download/${TAG}/${ZIP_NAME}"
                sparkle:edSignature="${SIG}"
                length="${LEN}"
                type="application/octet-stream"
            />
        </item>
    </channel>
</rss>
EOF

echo "⬆️  GitHub release ${TAG}…"
git add appcast.xml
git commit -m "release v${VERSION}" || true
gh release create "${TAG}" \
  --title "PK Voice Cloner ${VERSION}" \
  --generate-notes \
  "build/${ZIP_NAME}" "build/${DMG_NAME}"
git push

echo "✅ Release ${TAG} publiée. L'appcast est à jour sur main."
