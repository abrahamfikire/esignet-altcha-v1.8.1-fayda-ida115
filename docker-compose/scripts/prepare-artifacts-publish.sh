#!/usr/bin/env bash
# Populate esignet/artifacts/src for amanijo/artifactory-server esignet-ui-assets image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ART="$ROOT/artifacts"
SRC="$ART/src"
MIRROR="$ROOT/docker-compose/verifayda-artifactory-src"
DC_PUBLIC="$ROOT/docker-compose/oidc-ui/public"
NIDP_SRC="${NIDP_SRC:-/home/amani/Documents/nidp/verifayda_artifactory/artifactory-server/artifacts/src}"

pick() {
  if [[ -d "$1" ]]; then echo "$1"; else echo "$2"; fi
}

BASE="$(pick "$NIDP_SRC" "$MIRROR")"
echo "Base artifactory src: $BASE"

rm -rf "$SRC"
mkdir -p "$SRC/i18n/esignet-i18n-bundle" "$SRC/theme/esignet-theme" "$SRC/image/esignet-image"
cp -a "$BASE/i18n/esignet-i18n-bundle/." "$SRC/i18n/esignet-i18n-bundle/"
cp -a "$BASE/theme/esignet-theme/." "$SRC/theme/esignet-theme/"
cp -a "$BASE/image/esignet-image/." "$SRC/image/esignet-image/"

# VeriFayda overrides (TOTP strings, FAN/FCN, en+am language dropdown)
cp -f "$DC_PUBLIC/locales/en.json" "$SRC/i18n/esignet-i18n-bundle/en.json"
cp -f "$DC_PUBLIC/locales/am.json" "$SRC/i18n/esignet-i18n-bundle/am.json"
cp -f "$DC_PUBLIC/locales/default.json" "$SRC/i18n/esignet-i18n-bundle/default.json"
cp -f "$DC_PUBLIC/theme/config.json" "$SRC/theme/esignet-theme/config.json"
cp -f "$DC_PUBLIC/theme/variables.css" "$SRC/theme/esignet-theme/variables.css"
cp -f "$DC_PUBLIC/theme/verifayda-overrides.css" "$SRC/theme/esignet-theme/verifayda-overrides.css"
cp -a "$DC_PUBLIC/images/." "$SRC/image/esignet-image/"
cp -f "$DC_PUBLIC/logo.png" "$SRC/image/esignet-image/logo.png" 2>/dev/null || true
cp -f "$DC_PUBLIC/images/logo.png" "$SRC/image/esignet-image/logo.png" 2>/dev/null || true
cp -f "$DC_PUBLIC/images/brand_logo.png" "$SRC/image/esignet-image/brand_logo.png" 2>/dev/null || true
cp -f "$DC_PUBLIC/images/footer_logo.png" "$SRC/image/esignet-image/footer_logo.png" 2>/dev/null || true
cp -f "$DC_PUBLIC/images/totp_icon.png" "$SRC/image/esignet-image/totp_icon.png" 2>/dev/null || true

echo "Prepared artifacts/src ($(du -sh "$SRC" | awk '{print $1}'))."
