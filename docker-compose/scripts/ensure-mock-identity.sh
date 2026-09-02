#!/usr/bin/env bash
# Start mock-identity-system and recover from PKCS12/DB keystore drift (common after container recreate).
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi
MOCK_PORT="${MOCK_IDENTITY_HOST_PORT:-8082}"
PG_HOST="${MOCK_DB_HOST:-127.0.0.1}"
PG_PORT="${MOCK_DB_PORT:-${POSTGRES_HOST_PORT:-5455}}"
PG_USER="${MOCK_DB_USER:-postgres}"
PG_PASS="${MOCK_DB_PASSWORD:-postgres}"
INDIVIDUAL_ID="${MOCK_INDIVIDUAL_ID:-1234567890123456}"

mock_health() {
  curl -sf "http://127.0.0.1:${MOCK_PORT}/v1/mock-identity-system/actuator/health" >/dev/null 2>&1
}

reset_mock_keys() {
  echo "  reset mock-identity key_alias/key_store (keystore drift)"
  export PGPASSWORD="$PG_PASS"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d mosip_mockidentitysystem \
    -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
TRUNCATE mockidentitysystem.key_alias, mockidentitysystem.key_store;
SQL
}

seed_mock_user() {
  local body http_code resp
  resp="$(curl -sf "http://127.0.0.1:${MOCK_PORT}/v1/mock-identity-system/identity/${INDIVIDUAL_ID}" 2>/dev/null || true)"
  if [[ -n "$resp" ]] && echo "$resp" | grep -q '"individualId"'; then
    echo "  mock user ${INDIVIDUAL_ID} already present"
    return 0
  fi
  echo "  create mock user ${INDIVIDUAL_ID}"
  body="$(cat <<EOF
{
  "requestTime": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "request": {
    "individualId": "${INDIVIDUAL_ID}",
    "pin": "545411",
    "email": "local@test.fayda.et",
    "phone": "+251911000000",
    "fullName": [{"language": "eng", "value": "Local Test User"}],
    "givenName": [{"language": "eng", "value": "Local Test User"}],
    "familyName": [{"language": "eng", "value": "User"}],
    "gender": [{"language": "eng", "value": "Male"}],
    "dateOfBirth": "1990/01/01",
    "streetAddress": [{"language": "eng", "value": "Addis Ababa"}],
    "locality": [{"language": "eng", "value": "Addis Ababa"}],
    "region": [{"language": "eng", "value": "Addis Ababa"}],
    "country": [{"language": "eng", "value": "Ethiopia"}],
    "postalCode": "1000",
    "password": "Mosip@123",
    "preferredLang": "eng",
    "locale": "en",
    "encodedPhoto": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z"
  }
}
EOF
)"
  http_code="$(curl -s -o /tmp/mock-create-user.json -w '%{http_code}' \
    -X POST "http://127.0.0.1:${MOCK_PORT}/v1/mock-identity-system/identity" \
    -H 'Content-Type: application/json' \
    -d "$body")"
  if [[ "$http_code" != "200" ]] || grep -q '"errors":\[' /tmp/mock-create-user.json 2>/dev/null && ! grep -q '"errors":\[\]' /tmp/mock-create-user.json 2>/dev/null; then
    echo "  warn: mock user create returned ${http_code}: $(tr -d '\n' < /tmp/mock-create-user.json | head -c 240)"
  fi
}

cd "$DC"
echo "==> mock-identity-system :${MOCK_PORT}"
docker compose up -d database mock-identity-system 2>/dev/null || \
  docker compose -f dependent-docker-compose.yml up -d database mock-identity-system 2>/dev/null || true

if mock_health; then
  echo "  mock-identity healthy"
else
  if docker logs docker-compose-mock-identity-system-1 2>&1 | tail -5 | grep -q 'KER-KMA-004'; then
    reset_mock_keys
  elif ! mock_health; then
    # Container may have exited before we can read logs; safe to reset once for local dev.
    reset_mock_keys
  fi
  docker compose up -d mock-identity-system 2>/dev/null || \
    docker compose -f dependent-docker-compose.yml up -d mock-identity-system 2>/dev/null || true
fi

ok=0
for _ in $(seq 1 60); do
  if mock_health; then ok=1; break; fi
  if docker ps -a --filter name=mock-identity-system --format '{{.Status}}' 2>/dev/null | grep -qi 'exited'; then
    if docker logs docker-compose-mock-identity-system-1 2>&1 | grep -q 'KER-KMA-004'; then
      reset_mock_keys
      docker compose up -d mock-identity-system 2>/dev/null || true
    fi
  fi
  sleep 2
done

if [[ "$ok" != 1 ]]; then
  echo "mock-identity did not become healthy on :${MOCK_PORT}"
  docker logs docker-compose-mock-identity-system-1 2>&1 | tail -20 || true
  exit 1
fi

seed_mock_user
echo "  mock-identity ready"
