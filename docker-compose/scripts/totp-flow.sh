#!/usr/bin/env bash
set -euo pipefail

# POC resident Basic-auth is bound to this individualId (KER-OTV-011 otherwise).
POC_BOUND_ID="${POC_BOUND_ID:-1234567890123456}"
INDIVIDUAL_ID="${INDIVIDUAL_ID:-$POC_BOUND_ID}"
# Mimoto proxy (test) or direct TOTP host (oracle1). Host-only oracle1 URL is normalized to /v1.
BASE="${BASE:-https://injiweb.test.fayda.et/v1/mimoto}"
RESIDENT_USER="${RESIDENT_USER:-resident}"
RESIDENT_PASS="${RESIDENT_PASS:-fayda}"
VERIFY_USER="${VERIFY_USER:-id-auth}"
VERIFY_PASS="${VERIFY_PASS:-fayda}"

BASE="${BASE%/}"
if [[ "$BASE" == "https://totp.oracle1.fayda.et" ]]; then
  BASE="$BASE/v1"
fi

if [[ -z "${VERIFY_URL:-}" ]]; then
  if [[ "$BASE" == *"/v1/mimoto" ]]; then
    VERIFY_URL="${BASE%/v1/mimoto}/v1/totp/verify"
  else
    VERIFY_URL="$BASE/totp/verify"
  fi
fi

if [[ "$INDIVIDUAL_ID" != "$POC_BOUND_ID" && "${ALLOW_UNBOUND_ID:-}" != "1" ]]; then
  echo "Enroll will fail with KER-OTV-011 (subject mismatch)."
  echo "POC user '$RESIDENT_USER' is bound to individualId=$POC_BOUND_ID."
  echo "You passed INDIVIDUAL_ID=$INDIVIDUAL_ID."
  echo "Re-run with INDIVIDUAL_ID=$POC_BOUND_ID, or set ALLOW_UNBOUND_ID=1 if your credentials match that ID."
  exit 1
fi

if [[ "${CODE_ONLY:-}" == "1" ]]; then
  SECRET_FILE="${SAVE_SECRET_FILE:-/tmp/esignet-totp-secret.env}"
  if [[ ! -f "$SECRET_FILE" ]]; then
    echo "No saved secret at $SECRET_FILE — run without CODE_ONLY=1 first."
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$SECRET_FILE"
  echo "Using saved secret for individualId=$INDIVIDUAL_ID algo=$ALGO"
  COOKIE="$(mktemp)"
  trap 'rm -f "$COOKIE"' EXIT
  totp_code() {
    TOTP_SECRET="$SECRET" TOTP_TIME="$1" TOTP_STEP="$STEP" TOTP_DIGITS="$DIGITS" TOTP_ALGO="$ALGO" python3 - <<'PY'
import os, base64, hmac, hashlib, struct
secret = os.environ["TOTP_SECRET"].replace(" ", "").upper()
key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
counter = int(os.environ["TOTP_TIME"]) // int(os.environ["TOTP_STEP"])
digest = getattr(hashlib, os.environ["TOTP_ALGO"].lower().replace("sha", "sha"))
hs = hmac.new(key, struct.pack(">Q", counter), digest).digest()
o = hs[-1] & 15
code = (struct.unpack(">I", hs[o:o+4])[0] & 0x7fffffff) % (10 ** int(os.environ["TOTP_DIGITS"]))
print(str(code).zfill(int(os.environ["TOTP_DIGITS"])))
PY
  }
  TIME_JSON="$(curl -k -sS "$BASE/totp/time")"
  SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
  echo "FAN:  $INDIVIDUAL_ID"
  echo "Code: $(totp_code "$SERVER_TIME")"
  exit 0
fi

COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

echo "1) Get server time + XSRF"
TIME_JSON="$(curl -k -sS -c "$COOKIE" "$BASE/totp/time")"
SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
XSRF="$(awk '/XSRF-TOKEN/ {print $7}' "$COOKIE" | tail -1)"
HEADERS=(-H "Content-Type: application/json")
if [[ -n "$XSRF" ]]; then
  HEADERS+=(-H "X-XSRF-TOKEN: $XSRF")
fi

echo "2) Enroll"
ENROLL_JSON="$(curl -k -sS -b "$COOKIE" -c "$COOKIE" \
  -u "$RESIDENT_USER:$RESIDENT_PASS" \
  "${HEADERS[@]}" \
  -d "{
    \"id\":\"fayda.identity.totp.enroll\",
    \"version\":\"1.0\",
    \"requesttime\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"request\":{\"individualId\":\"$INDIVIDUAL_ID\"}
  }" \
  "$BASE/totp/enroll")"

SECRET="$(jq -r '.response.secretKey // empty' <<<"$ENROLL_JSON")"
SESSION_ID="$(jq -r '.response.sessionId // empty' <<<"$ENROLL_JSON")"
ALGO="$(jq -r '.response.algorithm // "SHA256"' <<<"$ENROLL_JSON")"
DIGITS="$(jq -r '.response.otpLength // 6' <<<"$ENROLL_JSON")"
STEP="$(jq -r '.response.totpTimeStep // 30' <<<"$ENROLL_JSON")"

if [[ -z "$SECRET" ]]; then
  echo "Enroll failed:"
  jq . <<<"$ENROLL_JSON"
  exit 1
fi

echo "Enroll OK: session=${SESSION_ID:0:8}... algo=$ALGO digits=$DIGITS step=$STEP secret=masked"
SECRET_NOPAD="$(printf '%s' "$SECRET" | tr -d ' =' | tr '[:lower:]' '[:upper:]')"
SAVE_SECRET_FILE="${SAVE_SECRET_FILE:-/tmp/esignet-totp-secret.env}"
umask 077
cat > "$SAVE_SECRET_FILE" <<EOF
SECRET=$SECRET
SECRET_NOPAD=$SECRET_NOPAD
ALGO=$ALGO
DIGITS=$DIGITS
STEP=$STEP
INDIVIDUAL_ID=$INDIVIDUAL_ID
OTPAUTH=otpauth://totp/VeriFayda:${INDIVIDUAL_ID}?secret=${SECRET_NOPAD}&issuer=VeriFayda&algorithm=${ALGO}&digits=${DIGITS}&period=${STEP}
EOF

if [[ "${ALGO^^}" == "SHA256" ]]; then
  echo
  echo "=== Add to Google Authenticator on your phone ==="
  echo "Option A — Scan QR (easiest):"
  python3 - <<PY
import urllib.parse
uri = "$OTPAUTH"
qr = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + urllib.parse.quote(uri, safe="")
print("  Open this URL on your PC, scan with GA app → + → Scan QR:")
print("  " + qr)
PY
  echo
  echo "Option B — Manual entry in Google Authenticator:"
  echo "  + → Enter a setup key"
  echo "  Account name: VeriFayda"
  echo "  Key: $SECRET_NOPAD"
  echo "  Type: Time based, 6 digits, 30 seconds"
  echo
  echo "Then on the PC login page: Login with TOTP Code → FAN $INDIVIDUAL_ID → code from phone."
  echo "Do NOT use 111111 after enroll — only the live code from your phone works."
  echo "Secret saved in $SAVE_SECRET_FILE"
fi

totp_code() {
  TOTP_SECRET="$SECRET" TOTP_TIME="$1" TOTP_STEP="$STEP" TOTP_DIGITS="$DIGITS" TOTP_ALGO="$ALGO" python3 - <<'PY'
import os, base64, hmac, hashlib, struct
secret = os.environ["TOTP_SECRET"].replace(" ", "").upper()
key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
counter = int(os.environ["TOTP_TIME"]) // int(os.environ["TOTP_STEP"])
digest = getattr(hashlib, os.environ["TOTP_ALGO"].lower().replace("sha", "sha"))
hs = hmac.new(key, struct.pack(">Q", counter), digest).digest()
o = hs[-1] & 15
code = (struct.unpack(">I", hs[o:o+4])[0] & 0x7fffffff) % (10 ** int(os.environ["TOTP_DIGITS"]))
print(str(code).zfill(int(os.environ["TOTP_DIGITS"])))
PY
}

echo "3) Confirm enrollment"
TIME_JSON="$(curl -k -sS -b "$COOKIE" "$BASE/totp/time")"
SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
CODE="$(totp_code "$SERVER_TIME")"

CONFIRM_REQ="{\"individualId\":\"$INDIVIDUAL_ID\",\"code\":\"$CODE\"}"
if [[ -n "$SESSION_ID" ]]; then
  CONFIRM_REQ="{\"individualId\":\"$INDIVIDUAL_ID\",\"sessionId\":\"$SESSION_ID\",\"code\":\"$CODE\"}"
fi

CONFIRM_JSON="$(curl -k -sS -b "$COOKIE" \
  -u "$RESIDENT_USER:$RESIDENT_PASS" \
  "${HEADERS[@]}" \
  -d "{
    \"id\":\"fayda.identity.totp.verify-enrollment\",
    \"version\":\"1.0\",
    \"requesttime\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"request\":$CONFIRM_REQ
  }" \
  "$BASE/totp/verify-enrollment")"

jq '{response, errors}' <<<"$CONFIRM_JSON"

CONFIRM_STATUS="$(jq -r '.response.status // empty' <<<"$CONFIRM_JSON")"
if [[ "$CONFIRM_STATUS" != "success" ]]; then
  echo "Confirm failed. Credential is not active, so verify will not work."
  echo "KER-OTV-500 is a server exception on totp-enroll-service (check those logs)."
  exit 1
fi

if [[ -n "$VERIFY_URL" ]]; then
  echo "4) Verify active credential"
  TIME_JSON="$(curl -k -sS "$BASE/totp/time")"
  SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
  VERIFY_CODE="$(totp_code "$SERVER_TIME")"

  VERIFY_JSON="$(curl -k -sS \
    -u "$VERIFY_USER:$VERIFY_PASS" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\":\"fayda.identity.totp.verify\",
      \"version\":\"1.0\",
      \"requesttime\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
      \"request\":{\"individualId\":\"$INDIVIDUAL_ID\",\"totp\":\"$VERIFY_CODE\"}
    }" \
    "$VERIFY_URL")"

  jq '{response, errors}' <<<"$VERIFY_JSON"
else
  echo "Skipped final verifier call. Set VERIFY_URL to run it."
fi

TIME_JSON="$(curl -k -sS "$BASE/totp/time")"
SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
UI_CODE="$(totp_code "$SERVER_TIME")"
echo
echo "========================================"
echo "Type this in the VeriFayda login UI now"
echo "  FAN:  $INDIVIDUAL_ID"
echo "  Code: $UI_CODE"
echo "The code changes about every ${STEP}s. Re-run with CODE_ONLY=1 to print a new one."
echo "========================================"

if [[ "${WATCH:-}" == "1" ]]; then
  echo "Printing a new code every ${STEP}s (Ctrl+C to stop)."
  while true; do
    TIME_JSON="$(curl -k -sS "$BASE/totp/time")"
    SERVER_TIME="$(jq -r '.response.serverTimeEpochSeconds' <<<"$TIME_JSON")"
    echo "$(date +%H:%M:%S)  $(totp_code "$SERVER_TIME")"
    sleep "$STEP"
  done
fi
