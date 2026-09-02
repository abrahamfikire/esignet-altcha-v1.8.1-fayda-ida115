#!/usr/bin/env bash
# One command to run the local VeriFayda stack:
#   postgres/redis/kafka/mock-identity (docker)
#   artifactory, TOTP proxy, eSignet (host), oidc-ui (docker)
# Ports come from docker-compose/.env (VPN-safe defaults).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DC="$ROOT/docker-compose"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi
ART_PORT="${ARTIFACTORY_PORT:-${ARTIFACTORY_HOST_PORT:-18080}}"
UI_PORT="${OIDC_UI_HOST_PORT:-3000}"
API_PORT="${ESIGNET_HOST_PORT:-8088}"
IMAGE="${OIDC_UI_IMAGE:-amanijo/oidc-ui:v1.8.x-verifayda-latest}"
ESIGNET_JAR="${ESIGNET_JAR:-$ROOT/esignet-service/target/esignet-service-1.8.0.jar}"
PLUGIN_DIR="$ROOT/esignet-service/plugins"
MAPPING_FILE="$ROOT/esignet-service/src/main/resources/amr_acr_mapping.json"
NETWORK="${OIDC_UI_NETWORK:-verifayda-local}"
DOCKER_SUBNET="${DOCKER_SUBNET:-198.18.50.0/24}"

chmod +x "$DC/scripts/"*.sh "$DC/scripts/"*.py "$DC/run-local.sh" 2>/dev/null || true

echo "==> Sync VeriFayda branding assets"
"$DC/scripts/sync-branding.sh"

kill_port() {
  local port="$1"
  local pids
  pids="$(ss -ltnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  for pid in $pids; do
    echo "  stopping pid $pid on :$port"
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
}

echo "==> Docker deps (govvpn-safe networks)"
cd "$DC"
chmod +x "$DC/scripts/ensure-docker-network.sh"
"$DC/scripts/ensure-docker-network.sh"
if [[ -f dependent-docker-compose.yml ]]; then
  docker compose -f dependent-docker-compose.yml up -d
fi
docker compose up -d database redis kafka zookeeper 2>/dev/null || \
  docker compose up -d database redis

echo "==> mock-identity-system"
chmod +x "$DC/scripts/ensure-mock-identity.sh"
"$DC/scripts/ensure-mock-identity.sh"

docker network inspect "$NETWORK" >/dev/null 2>&1 || true

echo "==> Artifactory :${ART_PORT}"
"$DC/scripts/ensure-artifactory.sh"

echo "==> TOTP verify proxy :8099"
kill_port 8099
nohup python3 "$DC/scripts/local-totp-verify-proxy.py" \
  >/tmp/local-totp-proxy.log 2>&1 &
echo "  pid $!"

echo "==> eSignet :${API_PORT}"
if [[ ! -f "$ESIGNET_JAR" ]]; then
  echo "Missing $ESIGNET_JAR"
  exit 1
fi

echo "==> Local demo client (logo + login options)"
chmod +x "$DC/scripts/setup-local-client.sh"
"$DC/scripts/setup-local-client.sh"

kill_port "$API_PORT"
cd "$ROOT/esignet-service"
nohup java -jar \
  -Dloader.path="$PLUGIN_DIR" \
  -Dspring.profiles.active=default,local \
  -Dspring.config.additional-location=optional:file:"$DC/verifayda-totp.properties" \
  -Dmosip.esignet.amr-acr-mapping-file-path=file:"$MAPPING_FILE" \
  -Dmosip.esignet.mock.authenticator.totp-verify-url=http://127.0.0.1:8099/v1/totp/verify \
  -Dmosip.esignet.mock.authenticator.totp-verify-username=id-auth \
  -Dmosip.esignet.mock.authenticator.totp-verify-password=fayda \
  -Dmosip.esignet.mock.authenticator.totp-mock-otp=111111 \
  "$ESIGNET_JAR" >/tmp/esignet-local.log 2>&1 &
ESIGNET_PID=$!
echo "  pid $ESIGNET_PID"

echo "==> Wait for eSignet (before UI)"
esignet_ok=0
for i in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:${API_PORT}/v1/esignet/actuator/health" >/dev/null \
     && curl -sf "http://127.0.0.1:${API_PORT}/v1/esignet/csrf/token" >/dev/null 2>&1; then
    esignet_ok=1
    break
  fi
  sleep 2
done
if [[ "$esignet_ok" != 1 ]]; then
  echo "eSignet did not become ready. See /tmp/esignet-local.log"
  tail -30 /tmp/esignet-local.log || true
  exit 1
fi
echo "  eSignet ready"

echo "==> oidc-ui :${UI_PORT}"
docker rm -f oidc-ui >/dev/null 2>&1 || true
docker run -d --name oidc-ui --network "$NETWORK" \
  --add-host=esignet:host-gateway \
  --add-host=host.docker.internal:host-gateway \
  --add-host=artifactory:host-gateway \
  -p "127.0.0.1:${UI_PORT}:3000" \
  -e container_user=mosip \
  -e DEFAULT_TITLE="VeriFayda 2.0" \
  -e DEFAULT_ID_PROVIDER_NAME="VeriFayda 2.0" \
  -e DEFAULT_FEVICON=logo.png \
  -e DEFAULT_LANG=en \
  -e DEFAULT_THEME=default \
  -e i18n_url_env= \
  -e theme_url_env= \
  -e images_url_env= \
  -v "$DC/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$DC/configure_start.sh:/home/mosip/configure_start.sh:ro" \
  -v "$DC/oidc-ui/public/locales:/usr/share/nginx/html/locales:ro" \
  -v "$DC/oidc-ui/public/theme:/usr/share/nginx/html/theme:ro" \
  -v "$DC/oidc-ui/public/images:/verifayda-assets/images:ro" \
  -v "$DC/oidc-ui/public/logo.png:/verifayda-assets/logo.png:ro" \
  -v "$DC/oidc-ui/public/images/footer_logo.png:/verifayda-assets/footer_logo.png:ro" \
  -v "$DC/oidc-ui/public/images/demo-client-logo.png:/verifayda-assets/demo-client-logo.png:ro" \
  -v "$DC/oidc-ui/public/totp-setup.js:/verifayda-assets/totp-setup.js:ro" \
  -v "$DC/oidc-ui/public/verifayda-ui-fix.js:/verifayda-assets/verifayda-ui-fix.js:ro" \
  --entrypoint sh \
  "$IMAGE" configure_start.sh /bin/sh -c 'echo "starting nginx"; nginx; sleep infinity'

echo "==> Wait for health"
ok=0
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${API_PORT}/v1/esignet/actuator/health" >/dev/null \
     && curl -sf -o /dev/null "http://127.0.0.1:${UI_PORT}/" \
     && curl -sf -o /dev/null "http://127.0.0.1:${ART_PORT}/logo.png"; then
    ok=1
    break
  fi
  sleep 2
done

echo
curl -sS -o /dev/null -w "ui logo:     %{size_download} bytes\n" "http://127.0.0.1:${UI_PORT}/logo.png" || true
curl -sS -o /dev/null -w "art logo:    %{size_download} bytes\n" "http://127.0.0.1:${ART_PORT}/logo.png" || true
curl -sS -o /dev/null -w "esignet:     %{http_code}\n" "http://127.0.0.1:${API_PORT}/v1/esignet/actuator/health" || true
if [[ "$ok" != 1 ]]; then
  echo "Not fully up. Logs: /tmp/esignet-local.log  docker logs oidc-ui"
  exit 1
fi

echo
echo "Ready:"
echo "  UI   http://127.0.0.1:${UI_PORT}"
echo "  API  http://127.0.0.1:${API_PORT}/v1/esignet"
echo "  Art  http://127.0.0.1:${ART_PORT}"
echo
echo "Test OTP end-to-end (mock FAN + OTP):"
echo "  $DC/scripts/test-otp-flow.sh"
echo
echo "Enroll TOTP and print a UI code:"
echo "  $DC/scripts/enroll-totp.sh"
echo "Print another code later:"
echo "  CODE_ONLY=1 $DC/scripts/enroll-totp.sh"
echo
echo "Hard-refresh the login page (Ctrl+Shift+R)."
