#!/usr/bin/env bash
# Pull amanijo/oidc-ui:v1.8.x-verifayda-latest and extract the served UI into oidc-ui/
set -euo pipefail

IMAGE="${IMAGE:-amanijo/oidc-ui:v1.8.x-verifayda-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OIDC_UI="${OIDC_UI:-$ROOT/oidc-ui}"
EXTRACT_DIR="${EXTRACT_DIR:-/tmp/amanijo-oidc-ui-extract}"
CONTAINER_NAME="tmp-verifayda-oidc-ui-extract"

echo "==> Pulling $IMAGE"
docker pull "$IMAGE"

echo "==> Creating container (no start)"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker create --name "$CONTAINER_NAME" "$IMAGE" >/dev/null

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

echo "==> Copying filesystem from image"
# nginx html (built React app) + configure scripts
docker cp "$CONTAINER_NAME:/usr/share/nginx/html/." "$EXTRACT_DIR/html/" 2>/dev/null || true
docker cp "$CONTAINER_NAME:/home/mosip/." "$EXTRACT_DIR/home-mosip/" 2>/dev/null || true
docker cp "$CONTAINER_NAME:/etc/nginx/nginx.conf" "$EXTRACT_DIR/nginx.conf" 2>/dev/null || true

# Also dump full rootfs listing of interesting paths
docker export "$CONTAINER_NAME" | tar -t | grep -E 'usr/share/nginx/html|configure_start|env-config|totp|fayda' | head -80 || true

echo "==> Image extract summary"
find "$EXTRACT_DIR" -maxdepth 3 -type d | head -80
ls -la "$EXTRACT_DIR/html" 2>/dev/null | head -40
ls -la "$EXTRACT_DIR/html/images" 2>/dev/null | head -40
ls -la "$EXTRACT_DIR/html/static/js" 2>/dev/null | head -20
test -f "$EXTRACT_DIR/html/images/totp_icon.png" && echo "HAS totp_icon.png" || echo "NO totp_icon.png"
test -f "$EXTRACT_DIR/html/images/totp_icon.svg" && echo "HAS totp_icon.svg" || echo "NO totp_icon.svg"
rg -l 'TOTP|totp_icon|faydapass' "$EXTRACT_DIR/html" 2>/dev/null | head -20 || true

echo "==> Syncing built assets into $OIDC_UI/build and public"
mkdir -p "$OIDC_UI/build" "$OIDC_UI/public"
if [[ -d "$EXTRACT_DIR/html" ]]; then
  rsync -a --delete \
    --exclude 'plugins/temp' \
    "$EXTRACT_DIR/html/" "$OIDC_UI/build/"
  # Keep editable public mirrors for locales/theme/images/env
  [[ -d "$EXTRACT_DIR/html/locales" ]] && rsync -a "$EXTRACT_DIR/html/locales/" "$OIDC_UI/public/locales/"
  [[ -d "$EXTRACT_DIR/html/theme" ]] && rsync -a "$EXTRACT_DIR/html/theme/" "$OIDC_UI/public/theme/"
  [[ -d "$EXTRACT_DIR/html/images" ]] && rsync -a "$EXTRACT_DIR/html/images/" "$OIDC_UI/public/images/"
  [[ -f "$EXTRACT_DIR/html/logo.png" ]] && cp -f "$EXTRACT_DIR/html/logo.png" "$OIDC_UI/public/logo.png"
  [[ -f "$EXTRACT_DIR/html/env-config.js" ]] && cp -f "$EXTRACT_DIR/html/env-config.js" "$OIDC_UI/public/env-config.js"
  [[ -f "$EXTRACT_DIR/nginx.conf" ]] && cp -f "$EXTRACT_DIR/nginx.conf" "$ROOT/docker-compose/nginx.conf.verifayda-from-image"
fi

# Prefer image nginx if present
if [[ -f "$EXTRACT_DIR/nginx.conf" ]]; then
  mkdir -p "$OIDC_UI/nginx"
  cp -f "$EXTRACT_DIR/nginx.conf" "$OIDC_UI/nginx/nginx.conf.from-image"
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo
echo "Done."
echo "  Extracted to: $EXTRACT_DIR"
echo "  Build synced: $OIDC_UI/build"
echo "  Public synced: $OIDC_UI/public/{locales,theme,images}"
echo
echo "Next: update docker-compose to use image $IMAGE (or ./start-verifayda-local.sh with local build)."
