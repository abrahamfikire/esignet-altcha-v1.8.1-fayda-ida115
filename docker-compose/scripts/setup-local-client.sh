#!/usr/bin/env bash
# Point demo OIDC client at locally served logo; match production login options.
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_ID="${LOCAL_CLIENT_ID:-y2eznKdEGjXM0gRTrpbgbwVi4N2NoCxR4bZRh0BMPoE}"
LOGO_URL="${LOCAL_CLIENT_LOGO:-http://localhost:3000/images/demo-client-logo.png}"
DB_HOST="${ESIGNET_DB_HOST:-127.0.0.1}"
DB_PORT="${ESIGNET_DB_PORT:-5432}"
DB_NAME="${ESIGNET_DB_NAME:-mosip_esignet}"
DB_USER="${ESIGNET_DB_USER:-postgres}"
DB_PASS="${ESIGNET_DB_PASSWORD:-1748}"

LOGO_FILE="$DC/oidc-ui/public/images/demo-client-logo.png"
if [[ ! -f "$LOGO_FILE" ]]; then
  echo "Missing $LOGO_FILE — run sync-branding or curl healthservices logo first."
  exit 1
fi

export PGPASSWORD="$DB_PASS"
export PSQL_PAGER=cat
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -P pager=off <<SQL
UPDATE esignet.client_detail
SET logo_uri = '${LOGO_URL}',
    acr_values = '["mosip:idp:acr:generated-code","mosip:idp:acr:biometrics","mosip:idp:acr:faydapass-code"]',
    upd_dtimes = NOW()
WHERE id = '${CLIENT_ID}';
SQL

echo "Updated client ${CLIENT_ID}:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -P pager=off \
  -c "SELECT id, logo_uri, acr_values FROM esignet.client_detail WHERE id='${CLIENT_ID}';"
