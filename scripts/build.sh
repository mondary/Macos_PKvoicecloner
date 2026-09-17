#!/bin/bash
# PK Voice Cloner — build de l'app native (swiftc brut, pas de projet Xcode)
# Produit « PK Voice Cloner.app » à la racine : fenêtre WKWebView + serveur
# Python enfant + Sparkle (mises à jour via appcast GitHub).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '\n' < "${DIR}/VERSION")"

SPARKLE_VERSION="2.9.6"
SPARKLE_SHA256="52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192"
SPARKLE_DIR="${DIR}/release/sparkle"

APP_NAME="PK Voice Cloner"
APP="${DIR}/${APP_NAME}.app"
CONTENTS="${APP}/Contents"

if [[ ! -f "${SPARKLE_DIR}/Sparkle.framework/Sparkle" || ! -x "${SPARKLE_DIR}/bin/sign_update" ]]; then
  echo "⬇️  Téléchargement Sparkle ${SPARKLE_VERSION}…"
  mkdir -p "${SPARKLE_DIR}"
  curl -sL "https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz" \
    -o "${SPARKLE_DIR}/Sparkle.tar.xz"
  echo "${SPARKLE_SHA256}  ${SPARKLE_DIR}/Sparkle.tar.xz" | shasum -a 256 -c - >/dev/null
  tar xf "${SPARKLE_DIR}/Sparkle.tar.xz" -C "${SPARKLE_DIR}" ./Sparkle.framework ./bin
  rm -f "${SPARKLE_DIR}/Sparkle.tar.xz"
fi

echo "🔨 Compilation (${VERSION})…"
mkdir -p "${CONTENTS}/MacOS" "${CONTENTS}/Resources" "${CONTENTS}/Frameworks"

swiftc "${DIR}"/src/macos/*.swift \
  -F "${SPARKLE_DIR}" \
  -parse-as-library \
  -o "${CONTENTS}/MacOS/PKVoiceCloner" \
  -framework AppKit \
  -framework WebKit \
  -framework Sparkle \
  -Xlinker -rpath -Xlinker "@executable_path/../Frameworks"

cp -R "${SPARKLE_DIR}/Sparkle.framework" "${CONTENTS}/Frameworks/"

printf '%s\n' "${DIR}" > "${CONTENTS}/Resources/ProjectRoot.txt"

# --- Icône (.icns) depuis icon.png ---
if [[ -f "${DIR}/icon.png" ]]; then
  ICONSET="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "${ICONSET}"
  for sz in 16 32 128 256 512; do
    sips -z "${sz}" "${sz}" "${DIR}/icon.png" --out "${ICONSET}/icon_${sz}x${sz}.png" >/dev/null
    d=$((sz * 2))
    sips -z "${d}" "${d}" "${DIR}/icon.png" --out "${ICONSET}/icon_${sz}x${sz}@2x.png" >/dev/null
  done
  iconutil -c icns "${ICONSET}" -o "${CONTENTS}/Resources/AppIcon.icns"
fi

cat > "${CONTENTS}/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>PKVoiceCloner</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.clm.pkvoicecloner</string>
    <key>CFBundleName</key>
    <string>PK Voice Cloner</string>
    <key>CFBundleDisplayName</key>
    <string>PK Voice Cloner</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.utilities</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>PK Voice Cloner enregistre ta voix pour créer ton clone vocal, entièrement en local.</string>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
    <key>SUFeedURL</key>
    <string>https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast.xml</string>
    <key>SUPublicEDKey</key>
    <string>t9Zzlc7LZD17hLCepinDvSRHk51hAWGbkFc2yVjbAYs=</string>
    <key>SUEnableAutomaticChecks</key>
    <true/>
</dict>
</plist>
EOF

# Signature : identité de développement si présente (dyld/Gatekeeper plus rapides
# qu'ad-hoc), sinon ad-hoc. Pour distribuer hors de ce Mac : Developer ID + notarisation.
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Developer ID Application|Apple Development/{print $2; exit}')"
if [[ -n "${IDENTITY}" ]]; then
  codesign --force --deep --sign "${IDENTITY}" "${APP}"
else
  codesign --force --deep --sign - "${APP}"
fi
echo "✅ ${APP}"
