#!/usr/bin/env bash
# Sync VeriFayda circular logo + footer wordmark to UI, artifactory, and mirror.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DC="$ROOT/docker-compose"
CIRCULAR="${VERIFAYDA_CIRCULAR_LOGO:-$ROOT/oidc-ui/build/images/logo.png}"
FOOTER="${VERIFAYDA_FOOTER_LOGO:-$DC/oidc-ui/public/images/footer_logo.png}"
ART_SRC="${ART_SRC:-/home/amani/Documents/nidp/verifayda_artifactory/artifactory-server/artifacts/src}"
MIRROR="$DC/verifayda-artifactory-src"
UI_PUBLIC="$DC/oidc-ui/public"
CACHE="${BRAND_CACHE_VERSION:-20260902f}"

if [[ ! -f "$CIRCULAR" ]]; then
  echo "Missing circular logo: $CIRCULAR"
  exit 1
fi
if [[ ! -f "$FOOTER" ]]; then
  echo "Missing footer logo: $FOOTER"
  exit 1
fi

echo "==> Sync branding (cache=$CACHE)"
echo "    circular: $CIRCULAR ($(stat -c%s "$CIRCULAR") bytes)"
echo "    footer:   $FOOTER ($(stat -c%s "$FOOTER") bytes)"

copy_file() {
  local src="$1" dest="$2"
  if [[ "$(readlink -f "$src" 2>/dev/null || echo "$src")" == "$(readlink -f "$dest" 2>/dev/null || echo "$dest")" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cp -f "$src" "$dest"
}

copy_logo() {
  copy_file "$CIRCULAR" "$1"
}

# Demo RP logo (Capital Bank) served locally for login card left icon
DEMO_CLIENT="$UI_PUBLIC/images/demo-client-logo.png"
if [[ ! -f "$DEMO_CLIENT" ]] || [[ "$(stat -c%s "$DEMO_CLIENT" 2>/dev/null || echo 0)" -lt 1000 ]]; then
  if curl -sfL 'https://healthservices.oracle1.fayda.et/logo.png' -o "$DEMO_CLIENT.tmp" 2>/dev/null; then
    mv -f "$DEMO_CLIENT.tmp" "$DEMO_CLIENT"
    echo "    downloaded demo-client-logo.png ($(stat -c%s "$DEMO_CLIENT") bytes)"
  else
    rm -f "$DEMO_CLIENT.tmp"
    echo "    warn: could not download demo-client-logo.png"
  fi
fi

mkdir -p "$UI_PUBLIC/images"
copy_logo "$UI_PUBLIC/logo.png"
copy_logo "$UI_PUBLIC/images/logo.png"
copy_logo "$UI_PUBLIC/images/brand_logo.png"
copy_file "$FOOTER" "$UI_PUBLIC/images/footer_logo.png"

# Workspace oidc-ui/public mirror
mkdir -p "$ROOT/oidc-ui/public/images"
copy_logo "$ROOT/oidc-ui/public/logo.png"
copy_logo "$ROOT/oidc-ui/public/images/logo.png"
copy_logo "$ROOT/oidc-ui/public/images/brand_logo.png"
copy_file "$FOOTER" "$ROOT/oidc-ui/public/images/footer_logo.png"

# Artifactory checkout (python server reads this)
if [[ -d "$ART_SRC/image/esignet-image" ]]; then
  copy_logo "$ART_SRC/image/esignet-image/logo.png"
  copy_logo "$ART_SRC/image/esignet-image/brand_logo.png"
  copy_file "$FOOTER" "$ART_SRC/image/esignet-image/footer_logo.png"
  copy_file "$CIRCULAR" "$ART_SRC/image/esignet-image/favicon.ico"
fi

# Workspace artifactory mirror
if [[ -d "$MIRROR/image/esignet-image" ]]; then
  copy_logo "$MIRROR/image/esignet-image/logo.png"
  copy_logo "$MIRROR/image/esignet-image/brand_logo.png"
  copy_file "$FOOTER" "$MIRROR/image/esignet-image/footer_logo.png"
fi

# Bump logo URLs in theme CSS
for css in "$UI_PUBLIC/theme/variables.css" "$ROOT/oidc-ui/public/theme/variables.css"; do
  [[ -f "$css" ]] || continue
  sed -i "s|/logo.png?v=[^\")]*|/logo.png?v=${CACHE}|g" "$css"
  sed -i "s|/logo.png\"|/logo.png?v=${CACHE}\"|g" "$css"
  sed -i "s|/images/footer_logo.png?v=[^\")]*|/images/footer_logo.png?v=${CACHE}|g" "$css"
  sed -i "s|/images/footer_logo.png\"|/images/footer_logo.png?v=${CACHE}|g" "$css"
done

# Overrides CSS — keep full file if present (modal + login icons)
if [[ ! -f "$UI_PUBLIC/theme/verifayda-overrides.css" ]] || ! grep -q 'totp-modal-overlay' "$UI_PUBLIC/theme/verifayda-overrides.css" 2>/dev/null; then
cat > "$UI_PUBLIC/theme/verifayda-overrides.css" <<'EOF'
/* VeriFayda — minimal overrides matching production oracle1 UI */
#totp_verify_input .pincode-input-text,
#otp_verify_input .pincode-input-text,
.text-white .pincode-input-text,
.pincode-input-text {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  caret-color: #ffffff !important;
  border-bottom: 2px solid #ffffff !important;
  font-size: 1.35rem !important;
  font-weight: 600 !important;
  background: transparent !important;
}

img.brand-logo,
img.brand-only-logo,
img.footer-brand-logo {
  content: none !important;
  object-fit: contain !important;
}

img.client-logo-size {
  object-fit: contain;
}

button[id^='login_with_'] img {
  background: #ffffff !important;
  border-radius: 8px !important;
  padding: 4px !important;
  object-fit: contain !important;
  box-sizing: border-box !important;
  width: 2rem !important;
  height: 2rem !important;
}
EOF
fi
cp -f "$UI_PUBLIC/theme/verifayda-overrides.css" "$ROOT/oidc-ui/public/theme/verifayda-overrides.css"

echo "==> Done. Verify:"
ls -l "$UI_PUBLIC/logo.png" "$UI_PUBLIC/images/footer_logo.png" "$UI_PUBLIC/images/demo-client-logo.png" 2>/dev/null || true
echo "    artifactory logo: $(stat -c%s "$ART_SRC/image/esignet-image/logo.png" 2>/dev/null || echo missing) bytes"
