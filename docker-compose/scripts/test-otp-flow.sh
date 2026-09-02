#!/usr/bin/env bash
# End-to-end OTP login against local eSignet + mock-identity-system.
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi

API="${ESIGNET_BASE:-http://127.0.0.1:${ESIGNET_HOST_PORT:-8088}/v1/esignet}"
CLIENT_ID="${LOCAL_CLIENT_ID:-y2eznKdEGjXM0gRTrpbgbwVi4N2NoCxR4bZRh0BMPoE}"
REDIRECT_URI="${LOCAL_REDIRECT_URI:-http://localhost:8000/callback}"
FAN="${MOCK_INDIVIDUAL_ID:-1234567890123456}"
OTP="${MOCK_OTP:-111111}"
MOCK_PORT="${MOCK_IDENTITY_HOST_PORT:-8082}"

echo "==> Prerequisites"
"$DC/scripts/ensure-mock-identity.sh"

python3 - "$API" "$CLIENT_ID" "$REDIRECT_URI" "$FAN" "$OTP" <<'PY'
import base64, hashlib, json, sys, urllib.error, urllib.request
from datetime import datetime, timezone

api, client_id, redirect_uri, fan, otp = sys.argv[1:6]

def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def oauth_hash(details):
    raw = json.dumps(details, separators=(",", ":"), sort_keys=False)
    # UI uses JSON.stringify(value) — preserve key order from API response object
    raw = json.dumps(details, separators=(",", ":"))
    digest = hashlib.sha256(raw.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")

def post(path, body, headers=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{api}{path}",
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {path}: {e.read().decode()[:500]}", file=sys.stderr)
        raise SystemExit(1)

print(f"==> oauth-details (client={client_id[:12]}…)")
oauth = post(
    "/authorization/v2/oauth-details",
    {
        "requestTime": now(),
        "request": {
            "clientId": client_id,
            "scope": "openid profile",
            "responseType": "code",
            "redirectUri": redirect_uri,
            "display": "page",
            "prompt": "login",
            "acrValues": "mosip:idp:acr:generated-code",
            "nonce": "local-nonce-otp-test",
            "state": "local-state-otp-test",
            "claimsLocales": "en",
        },
    },
)
if oauth.get("errors"):
    print("oauth-details failed:", oauth["errors"], file=sys.stderr)
    raise SystemExit(1)

details = oauth["response"]
txn = details["transactionId"]
ohash = oauth_hash(details)
print(f"    transactionId={txn}")

print(f"==> send-otp (FAN={fan})")
send = post(
    "/authorization/send-otp",
    {
        "requestTime": now(),
        "request": {
            "transactionId": txn,
            "individualId": fan,
            "otpChannels": ["email", "phone"],
        },
    },
    {"oauth-details-hash": ohash, "oauth-details-key": txn},
)
if send.get("errors"):
    print("send-otp failed:", send["errors"], file=sys.stderr)
    raise SystemExit(1)
print("    OTP sent (mock always accepts fixed code below)")

print(f"==> authenticate (OTP={otp})")
auth = post(
    "/authorization/v3/authenticate",
    {
        "requestTime": now(),
        "request": {
            "transactionId": txn,
            "individualId": fan,
            "challengeList": [
                {
                    "authFactorType": "OTP",
                    "challenge": otp,
                    "format": "alpha-numeric",
                }
            ],
        },
    },
    {"oauth-details-hash": ohash, "oauth-details-key": txn},
)
if auth.get("errors"):
    print("authenticate failed:", auth["errors"], file=sys.stderr)
    raise SystemExit(1)

print("==> OTP flow OK")
print(json.dumps(auth.get("response", {}), indent=2)[:400])
PY

echo
echo "UI manual test (same credentials):"
echo "  1. Open http://127.0.0.1:${OIDC_UI_HOST_PORT:-3000}"
echo "  2. Login with Code"
echo "  3. FAN:  $FAN"
echo "  4. Send Code → enter OTP: $OTP"
echo "  mock-identity: http://127.0.0.1:${MOCK_PORT}"
