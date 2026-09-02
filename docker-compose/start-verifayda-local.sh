#!/usr/bin/env bash
# Start VeriFayda stack using amanijo/oidc-ui:v1.8.x-verifayda-latest + local artifactory.
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && source .env && set +a

IMAGE="${OIDC_UI_IMAGE:-amanijo/oidc-ui:v1.8.x-verifayda-latest}"
ART_PORT="${ARTIFACTORY_HOST_PORT:-18080}"
UI_PORT="${OIDC_UI_HOST_PORT:-3000}"
API_PORT="${ESIGNET_HOST_PORT:-8088}"

chmod +x scripts/serve-verifayda-artifactory.py scripts/pull-and-sync-verifayda-oidc-ui.sh scripts/ensure-docker-network.sh 2>/dev/null || true

echo "==> Govvpn-safe Docker networks"
./scripts/ensure-docker-network.sh

echo "==> Ensuring UI image: $IMAGE"
docker pull "$IMAGE"

echo "==> Stopping previous stack..."
docker compose down --remove-orphans 2>/dev/null || true

echo "==> Starting artifactory + eSignet + VeriFayda UI..."
docker compose up -d

echo "==> Waiting for health..."
ok=0
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${ART_PORT}/artifactory/libs-release-local/theme/esignet-theme.zip" >/dev/null \
     && curl -sf "http://127.0.0.1:${API_PORT}/v1/esignet/actuator/health" >/dev/null \
     && curl -sf -o /dev/null "http://127.0.0.1:${UI_PORT}/"; then
    ok=1
    break
  fi
  sleep 4
done

echo
curl -sS -o /dev/null -w "artifactory: %{http_code}\n" "http://127.0.0.1:${ART_PORT}/images/brand_logo.png" || true
curl -sS -o /dev/null -w "esignet:     %{http_code}\n" "http://127.0.0.1:${API_PORT}/v1/esignet/actuator/health" || true
curl -sS -o /dev/null -w "ui:          %{http_code}\n" "http://127.0.0.1:${UI_PORT}/" || true

if [[ "$ok" -ne 1 ]]; then
  echo "Not fully healthy. Logs: docker compose logs --tail=80 artifactory esignet-ui esignet"
  exit 1
fi

./scripts/ensure-docker-network.sh

echo
echo "Up:"
echo "  UI  http://127.0.0.1:${UI_PORT}   (image $IMAGE)"
echo "  API http://127.0.0.1:${API_PORT}/v1/esignet"
echo "  Art http://127.0.0.1:${ART_PORT}"
