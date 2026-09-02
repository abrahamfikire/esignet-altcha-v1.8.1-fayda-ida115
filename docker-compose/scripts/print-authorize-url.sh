#!/usr/bin/env bash
# Print a fresh local VeriFayda authorize URL (always use this — not bare /login).
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi

UI="${UI_BASE:-http://localhost:3000}"
CLIENT="${LOCAL_CLIENT_ID:-y2eznKdEGjXM0gRTrpbgbwVi4N2NoCxR4bZRh0BMPoE}"
REDIRECT="${LOCAL_REDIRECT_URI:-http://localhost:8000/callback}"
ACR="${ACR_VALUES:-mosip:idp:acr:generated-code mosip:idp:acr:biometrics mosip:idp:acr:faydapass-code}"
NONCE="${1:-$(date +%s)}"
STATE="${2:-$(openssl rand -hex 16 2>/dev/null || date +%s)}"

URL="${UI}/authorize?client_id=${CLIENT}&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${REDIRECT}'))")&scope=openid%20profile%20email&response_type=code&acr_values=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${ACR}'))")&claims_locales=en&ui_locales=en&nonce=${NONCE}&state=${STATE}"

echo "$URL"
echo
echo "Open the URL above in your browser (use localhost consistently, not 127.0.0.1)."
echo "Close old /login tabs that have no # hash in the address bar."
