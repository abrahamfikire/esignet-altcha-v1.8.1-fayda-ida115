#!/usr/bin/env bash
# Sync VeriFayda local-dev assets into oidc-ui/ for production Docker build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DC_PUBLIC="$ROOT/docker-compose/oidc-ui/public"
OIDC="$ROOT/oidc-ui"
OIDC_PUBLIC="$OIDC/public"

echo "==> Sync VeriFayda public assets -> oidc-ui/public"
mkdir -p "$OIDC_PUBLIC/locales" "$OIDC_PUBLIC/theme" "$OIDC_PUBLIC/images"
cp -a "$DC_PUBLIC/locales/." "$OIDC_PUBLIC/locales/"
cp -a "$DC_PUBLIC/theme/." "$OIDC_PUBLIC/theme/"
cp -a "$DC_PUBLIC/images/." "$OIDC_PUBLIC/images/"
cp -f "$DC_PUBLIC/logo.png" "$OIDC_PUBLIC/logo.png" 2>/dev/null || true
cp -f "$DC_PUBLIC/totp-setup.js" "$OIDC_PUBLIC/totp-setup.js"
cp -f "$DC_PUBLIC/verifayda-ui-fix.js" "$OIDC_PUBLIC/verifayda-ui-fix.js"
cp -f "$DC_PUBLIC/env-config.js" "$OIDC_PUBLIC/env-config.js" 2>/dev/null || true

echo "==> configure_start.sh (VeriFayda runtime patches)"
cp -f "$ROOT/docker-compose/configure_start.sh" "$OIDC/configure_start.sh"
python3 - "$OIDC/configure_start.sh" <<'PY'
import sys
path = sys.argv[1]
text = open(path).read()
marker = 'echo "Replacing completed."\n'
inject = '''echo "Replacing completed."

vf_assets="/verifayda-assets"
if [ ! -d "$vf_assets" ] || { [ ! -f "$vf_assets/totp-setup.js" ] && [ ! -d "$vf_assets/images" ]; }; then
  vf_assets="/verifayda-baked"
  echo "Using baked VeriFayda assets from $vf_assets"
fi
'''
if marker not in text:
    raise SystemExit("configure_start marker missing")
text = text.replace(marker, inject, 1)
text = text.replace("/verifayda-assets/", '"$vf_assets"/')
text = text.replace("[ -d /verifayda-assets/images ]", '[ -d "$vf_assets/images" ]')
text = text.replace("[ -f /verifayda-assets/logo.png ]", '[ -f "$vf_assets/logo.png" ]')
text = text.replace("[ -f /verifayda-assets/images/logo.png ]", '[ -f "$vf_assets/images/logo.png" ]')
text = text.replace("[ -f /verifayda-assets/footer_logo.png ]", '[ -f "$vf_assets/footer_logo.png" ]')
text = text.replace("[ -f /verifayda-assets/demo-client-logo.png ]", '[ -f "$vf_assets/demo-client-logo.png" ]')
text = text.replace("[ -f /verifayda-assets/images/totp_icon.png ]", '[ -f "$vf_assets/images/totp_icon.png" ]')
text = text.replace("[ -f /verifayda-assets/images/top_logo.png ]", '[ -f "$vf_assets/images/top_logo.png" ]')
text = text.replace("[ -f /verifayda-assets/totp-setup.js ]", '[ -f "$vf_assets/totp-setup.js" ]')
text = text.replace("[ -f /verifayda-assets/verifayda-ui-fix.js ]", '[ -f "$vf_assets/verifayda-ui-fix.js" ]')
totp = '''
if [ -n "${TOTP_PROXY_UPSTREAM:-}" ]; then
  sed -i "s|TOTP_PROXY_PLACEHOLDER|${TOTP_PROXY_UPSTREAM}|g" /etc/nginx/nginx.conf
else
  sed -i '/location \\/local\\/totp\\//,/^[[:space:]]*}/d' /etc/nginx/nginx.conf || true
fi
'''
text = text.replace('exec "$@"', totp + '\nexec "$@"', 1)
open(path, "w").write(text)
PY
chmod +x "$OIDC/configure_start.sh"

echo "==> nginx.conf (TOTP proxy + cache headers)"
cp -f "$ROOT/docker-compose/nginx.conf" "$OIDC/nginx/nginx.conf"
# Production esignet host (docker-compose uses esignet:8088)
sed -i 's|http://esignet:8088/|http://esignet.esignet/|g' "$OIDC/nginx/nginx.conf"
# Runtime-configurable TOTP upstream (set TOTP_PROXY_UPSTREAM env at deploy)
sed -i 's|http://host.docker.internal:8099/local/totp/|TOTP_PROXY_PLACEHOLDER|g' "$OIDC/nginx/nginx.conf"

echo "==> verifayda-baked asset tree for image (no volume mount required)"
BAKED="$OIDC/verifayda-baked"
rm -rf "$BAKED"
mkdir -p "$BAKED/images"
cp -f "$OIDC_PUBLIC/totp-setup.js" "$BAKED/totp-setup.js"
cp -f "$OIDC_PUBLIC/verifayda-ui-fix.js" "$BAKED/verifayda-ui-fix.js"
cp -f "$OIDC_PUBLIC/logo.png" "$BAKED/logo.png" 2>/dev/null || cp -f "$OIDC_PUBLIC/images/logo.png" "$BAKED/logo.png"
cp -f "$OIDC_PUBLIC/images/footer_logo.png" "$BAKED/footer_logo.png" 2>/dev/null || true
cp -f "$OIDC_PUBLIC/images/demo-client-logo.png" "$BAKED/demo-client-logo.png" 2>/dev/null || true
cp -a "$OIDC_PUBLIC/images/." "$BAKED/images/"

echo "Prepared oidc-ui for docker build."
