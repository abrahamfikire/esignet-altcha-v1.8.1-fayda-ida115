#!/usr/bin/env bash
# Sync VeriFayda artifactory-server assets into oidc-ui/public (for npm start).
set -euo pipefail

ART_SRC="${ART_SRC:-/home/amani/Documents/nidp/verifayda_artifactory/artifactory-server/artifacts/src}"
# Fallback to workspace mirror if original checkout is unreadable
MIRROR="${MIRROR:-/home/amani/Documents/verifayda_esignet_v1.0.8/esignet/docker-compose/verifayda-artifactory-src}"
OIDC_PUBLIC="${OIDC_PUBLIC:-/home/amani/Documents/verifayda_esignet_v1.0.8/esignet/oidc-ui/public}"

pick() {
  local a="$1" b="$2"
  if [[ -d "$a" ]]; then echo "$a"; else echo "$b"; fi
}

I18N="$(pick "$ART_SRC/i18n/esignet-i18n-bundle" "$MIRROR/i18n/esignet-i18n-bundle")"
THEME="$(pick "$ART_SRC/theme/esignet-theme" "$MIRROR/theme/esignet-theme")"
IMAGE="$(pick "$ART_SRC/image/esignet-image" "$MIRROR/image/esignet-image")"

echo "i18n  <- $I18N"
echo "theme <- $THEME"
echo "image <- $IMAGE"
echo "dest  -> $OIDC_PUBLIC"

mkdir -p "$OIDC_PUBLIC/locales" "$OIDC_PUBLIC/theme" "$OIDC_PUBLIC/images"
cp -a "$I18N/." "$OIDC_PUBLIC/locales/"
cp -a "$THEME/." "$OIDC_PUBLIC/theme/"
cp -a "$IMAGE/." "$OIDC_PUBLIC/images/"
# Header uses the circular identity icon, not the wide VeriFayda 2.0 wordmark
# and not the high-res orange-e crop (fayda-logo-edit).
CIRCULAR=""
for c in \
  /home/amani/Documents/verifayda_esignet_v1.0.8/esignet/oidc-ui/build/images/logo.png \
  /home/amani/Documents/verifayda_esignet_v1.0.8/esignet/docker-compose/oidc-ui/public/images/favicon.ico \
  "$IMAGE/favicon.ico"
do
  if [[ -f "$c" ]]; then CIRCULAR="$c"; break; fi
done
if [[ -n "$CIRCULAR" ]]; then
  cp -f "$CIRCULAR" "$OIDC_PUBLIC/logo.png"
  cp -f "$CIRCULAR" "$OIDC_PUBLIC/images/logo.png"
  cp -f "$CIRCULAR" "$OIDC_PUBLIC/images/brand_logo.png"
else
  [[ -f "$OIDC_PUBLIC/images/logo.png" ]] && cp -f "$OIDC_PUBLIC/images/logo.png" "$OIDC_PUBLIC/logo.png"
fi

# Ensure TOTP / VeriFayda Code bits present
if [[ -f /home/amani/Documents/verifayda_esignet_v1.0.8/esignet/oidc-ui/public/images/faydapass_icon.svg ]]; then
  :
fi
# Keep faydapass / totp icons if mirror missed them
for f in faydapass_icon.svg totp_icon.png totp_icon.svg; do
  src="/home/amani/Documents/verifayda_esignet_v1.0.8/esignet/oidc-ui/build/images/$f"
  [[ -f "$OIDC_PUBLIC/images/$f" ]] || { [[ -f "$src" ]] && cp -f "$src" "$OIDC_PUBLIC/images/$f" || true; }
done

echo "Synced. Sample:"
ls -la "$OIDC_PUBLIC/images/brand_logo.png" "$OIDC_PUBLIC/images/faydapass_icon.svg" "$OIDC_PUBLIC/theme/variables.css" "$OIDC_PUBLIC/locales/en.json" 2>&1 | sed 's/^/  /'
python3 - <<PY
import json
from pathlib import Path
p=Path("$OIDC_PUBLIC/locales/en.json")
d=json.loads(p.read_text())
print("  signInOption.TOTP =", d.get("signInOption",{}).get("TOTP"))
print("  title consent logo_alt =", d.get("consent",{}).get("logo_alt"))
PY
