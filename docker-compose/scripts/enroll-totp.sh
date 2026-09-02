#!/usr/bin/env bash
# =============================================================================
# VeriFayda TOTP enroll for local login UI
# =============================================================================
# After this script, Google Authenticator works locally when:
#   1) You complete enroll + confirm (this script does both)
#   2) eSignet uses the local TOTP proxy on :8099 (run-local.sh starts it)
#   3) Secret is saved to /tmp/esignet-totp-secret.env
#
# Your enroll-only curl is NOT enough — you must confirm with verify-enrollment.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export BASE="${BASE:-https://totp.oracle1.fayda.et}"
export INDIVIDUAL_ID="${INDIVIDUAL_ID:-1234567890123456}"
export SAVE_SECRET_FILE="${SAVE_SECRET_FILE:-/tmp/esignet-totp-secret.env}"

echo "============================================================================="
echo " Enroll + confirm TOTP, then add secret to Google Authenticator (Manual entry)."
echo " Local login accepts GA codes via the :8099 proxy (SHA1 fallback)."
echo "============================================================================="
echo

if [[ "${CODE_ONLY:-}" == "1" ]]; then
  exec "$ROOT/docker-compose/scripts/totp-flow.sh"
fi

exec "$ROOT/docker-compose/scripts/totp-flow.sh" "$@"
