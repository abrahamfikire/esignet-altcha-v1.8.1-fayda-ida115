#!/usr/bin/env bash
# Local VeriFayda: deps + eSignet jar + artifactory + (optional) oidc-ui npm start
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DC="$ROOT/docker-compose"
ESIGNET_JAR="${ESIGNET_JAR:-$ROOT/esignet-service/target/esignet-service-1.8.0.jar}"
PLUGIN_DIR="$ROOT/esignet-service/plugins"
PROFILE="${SPRING_PROFILES_ACTIVE:-local}"

chmod +x "$DC/scripts/"*.sh "$DC/scripts/"*.py 2>/dev/null || true

echo "==> Govvpn-safe Docker networks"
"$DC/scripts/ensure-docker-network.sh"

echo "==> Sync artifactory -> oidc-ui/public"
"$DC/scripts/sync-artifactory-to-oidc-ui.sh"

echo "==> Start dependent services (db/redis/mock-identity)"
cd "$DC"
# Prefer dependent-docker-compose for local jar workflow
if [[ -f dependent-docker-compose.yml ]]; then
  docker compose -f dependent-docker-compose.yml up -d
else
  docker compose up -d database redis mock-identity-system
fi

echo "==> Start artifactory asset server"
if [[ -f "$DC/.env" ]]; then set -a; source "$DC/.env"; set +a; fi
ART_PORT="${ARTIFACTORY_PORT:-${ARTIFACTORY_HOST_PORT:-18080}}"
pkill -f 'serve-verifayda-artifactory.py' 2>/dev/null || true
pkill -f 'serve-esignet-ui-assets.py' 2>/dev/null || true
nohup python3 "$DC/scripts/serve-verifayda-artifactory.py" --host 127.0.0.1 --port "$ART_PORT" \
  > /tmp/verifayda-artifactory.log 2>&1 &
echo "  artifactory pid $! on :${ART_PORT} (log /tmp/verifayda-artifactory.log)"

echo "==> Start local TOTP verify proxy on :8099"
pkill -f 'local-totp-verify-proxy.py' 2>/dev/null || true
nohup python3 "$DC/scripts/local-totp-verify-proxy.py" \
  > /tmp/local-totp-proxy.log 2>&1 &
echo "  totp-proxy pid $! (log /tmp/local-totp-proxy.log)"

echo "==> Wait for mock-identity / redis"
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8082/v1/mock-identity-system/actuator/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ ! -f "$ESIGNET_JAR" ]]; then
  echo "Missing $ESIGNET_JAR — build esignet-service first."
  exit 1
fi

echo "==> Start eSignet on :8088 (profile=$PROFILE)"
pkill -f 'esignet-service-1.8.0.jar' 2>/dev/null || true
sleep 1
cd "$ROOT/esignet-service"
MAPPING_FILE="$ROOT/esignet-service/src/main/resources/amr_acr_mapping.json"
nohup java -jar \
  "-Dloader.path=$PLUGIN_DIR" \
  "-Dspring.profiles.active=$PROFILE" \
  "-Dspring.config.additional-location=optional:file:$DC/verifayda-totp.properties" \
  "-Dmosip.esignet.amr-acr-mapping-file-path=file:$MAPPING_FILE" \
  "-Dmosip.esignet.mock.authenticator.totp-verify-url=http://127.0.0.1:8099/v1/totp/verify" \
  "$ESIGNET_JAR" \
  > /tmp/esignet-local.log 2>&1 &
echo "  esignet pid $! (log /tmp/esignet-local.log)"

echo "==> Wait for eSignet health"
for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:8088/v1/esignet/actuator/health >/dev/null 2>&1; then
    echo "eSignet UP"
    break
  fi
  sleep 3
  if [[ "$i" -eq 90 ]]; then
    echo "eSignet failed to start. Tail /tmp/esignet-local.log:"
    tail -40 /tmp/esignet-local.log || true
    exit 1
  fi
done

echo
curl -sS -o /dev/null -w "artifactory brand: %{http_code}\n" http://127.0.0.1:8080/images/brand_logo.png || true
curl -sS -o /dev/null -w "esignet health:   %{http_code}\n" http://127.0.0.1:8088/v1/esignet/actuator/health || true
echo
echo "Now start UI:"
echo "  cd $ROOT/oidc-ui && npm start"
echo "UI proxies /v1/esignet -> :8088 and /locales|/theme|/images -> artifactory :8080"
