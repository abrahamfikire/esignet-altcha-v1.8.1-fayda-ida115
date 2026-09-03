#!/usr/bin/env python3
"""Local TOTP gateway for VeriFayda eSignet.

- POST /v1/totp/verify — login verify against Fayda upstream (and optional local GA secret)
- POST /local/totp/enroll — start enrollment, return QR + otpauth URI
- POST /local/totp/confirm — verify-enrollment to activate credential

Mock code 111111 is NEVER accepted unless ALLOW_MOCK_TOTP=1 is set explicitly.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import http.cookiejar
import json
import os
import re
import ssl
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

UPSTREAM_VERIFY = os.environ.get(
    "TOTP_UPSTREAM_VERIFY", "https://totp.oracle1.fayda.et/v1/totp/verify"
)
UPSTREAM_BASE = os.environ.get(
    "TOTP_UPSTREAM_BASE", "https://totp.oracle1.fayda.et/v1"
).rstrip("/")
MOCK_OTP = "111111"
ALLOW_MOCK_OTP = os.environ.get("ALLOW_MOCK_TOTP", "").lower() in ("1", "true", "yes")
VERIFY_USER = os.environ.get("TOTP_VERIFY_USER", "id-auth")
VERIFY_PASS = os.environ.get("TOTP_VERIFY_PASS", "fayda")
RESIDENT_USER = os.environ.get("TOTP_RESIDENT_USER", "resident")
RESIDENT_PASS = os.environ.get("TOTP_RESIDENT_PASS", "fayda")
SECRET_FILE = Path(os.environ.get("TOTP_SECRET_FILE", "/tmp/esignet-totp-secret.env"))
POC_BOUND_ID = os.environ.get("POC_BOUND_ID", "1234567890123456")
SSL_CTX = ssl._create_unverified_context()


def load_secret():
    if not SECRET_FILE.is_file():
        return None
    data = {}
    for line in SECRET_FILE.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        key, val = line.split("=", 1)
        data[key.strip()] = val.strip().strip('"').strip("'")
    secret = data.get("SECRET") or data.get("SECRET_NOPAD")
    if not secret:
        return None
    return {
        "secret": secret.replace(" ", "").upper(),
        "algo": (data.get("ALGO") or "SHA256").upper().replace("SHA", "SHA"),
        "digits": int(data.get("DIGITS") or "6"),
        "step": int(data.get("STEP") or "30"),
        "individual_id": data.get("INDIVIDUAL_ID"),
    }


def save_secret(
    secret: str,
    individual_id: str,
    algo: str,
    digits: int,
    step: int,
) -> str:
    secret_nopad = re.sub(r"[=\\s]", "", secret).upper()
    otpauth = (
        f"otpauth://totp/VeriFayda:{individual_id}?secret={secret_nopad}"
        f"&issuer=VeriFayda&algorithm={algo}&digits={digits}&period={step}"
    )
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    SECRET_FILE.write_text(
        "\n".join(
            [
                f"SECRET={secret}",
                f"SECRET_NOPAD={secret_nopad}",
                f"ALGO={algo}",
                f"DIGITS={digits}",
                f"STEP={step}",
                f"INDIVIDUAL_ID={individual_id}",
                f"OTPAUTH={otpauth}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    try:
        SECRET_FILE.chmod(0o600)
    except OSError:
        pass
    return otpauth


def totp_at(secret: str, epoch: int, step: int, digits: int, algo: str) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    counter = epoch // step
    digest = getattr(hashlib, algo.lower())
    hs = hmac.new(key, struct.pack(">Q", counter), digest).digest()
    offset = hs[-1] & 0x0F
    code = (struct.unpack(">I", hs[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


def totp_match(secret_cfg: dict, totp: str, skews: tuple[int, ...]) -> bool:
    now = int(time.time())
    for algo in ("SHA256", "SHA1"):
        for skew in skews:
            epoch = now + skew * secret_cfg["step"]
            if (
                totp_at(
                    secret_cfg["secret"],
                    epoch,
                    secret_cfg["step"],
                    secret_cfg["digits"],
                    algo,
                )
                == totp
            ):
                return True
    return False


def classify_failure(individual_id: str, totp: str) -> str:
    cfg = load_secret()
    if not cfg:
        return "totp_not_enrolled"
    if cfg.get("individual_id") and cfg["individual_id"] != individual_id:
        return "totp_invalid"
    if totp_match(cfg, totp, (0, -1, 1)):
        return "totp_invalid"
    if totp_match(cfg, totp, (-2, 2, -3, 3)):
        return "totp_expired"
    return "totp_invalid"


def local_totp_match(individual_id: str, totp: str) -> str | None:
    cfg = load_secret()
    if not cfg:
        return None
    if cfg.get("individual_id") and cfg["individual_id"] != individual_id:
        return None
    if totp_match(cfg, totp, (0, -1, 1)):
        return "Local TOTP accepted."
    return None


def fail_payload(error_code: str, message: str) -> bytes:
    return json.dumps(
        {
            "id": "fayda.identity.totp.verify",
            "version": "1.0",
            "response": None,
            "errors": [{"errorCode": error_code, "message": message}],
        }
    ).encode()


def success_payload(message: str, extra: dict | None = None) -> bytes:
    body = {
        "id": "fayda.identity.totp.verify",
        "version": "1.0",
        "response": {"status": "success", "message": message},
        "errors": [],
    }
    if extra:
        body["response"].update(extra)
    return json.dumps(body).encode()


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_opener(cookie_jar: http.cookiejar.CookieJar | None = None):
    handlers = [urllib.request.HTTPSHandler(context=SSL_CTX)]
    if cookie_jar is not None:
        handlers.insert(0, urllib.request.HTTPCookieProcessor(cookie_jar))
    return urllib.request.build_opener(*handlers)


def http_json(
    url: str,
    method: str = "GET",
    body: dict | None = None,
    headers: dict | None = None,
    auth: tuple[str, str] | None = None,
    cookie_jar: http.cookiejar.CookieJar | None = None,
) -> tuple[int, dict]:
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    if auth:
        token = base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    opener = build_opener(cookie_jar)
    try:
        with opener.open(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode() or "{}")
            return resp.status, payload
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode() or "{}")
        except Exception:
            payload = {"errors": [{"errorCode": "upstream_error", "message": str(e)}]}
        return e.code, payload
    except Exception as e:
        return 502, {"errors": [{"errorCode": "upstream_error", "message": str(e)}]}


def enroll_totp(individual_id: str) -> tuple[int, bytes]:
    if individual_id != POC_BOUND_ID and os.environ.get("ALLOW_UNBOUND_ID") != "1":
        return 400, fail_payload(
            "totp_enroll_failed",
            "TOTP enrollment is not available for this FAN.",
        )

    jar = http.cookiejar.CookieJar()
    _, time_json = http_json(f"{UPSTREAM_BASE}/totp/time", cookie_jar=jar)
    xsrf = ""
    for cookie in jar:
        if cookie.name == "XSRF-TOKEN":
            xsrf = cookie.value
    headers = {}
    if xsrf:
        headers["X-XSRF-TOKEN"] = xsrf

    enroll_body = {
        "id": "fayda.identity.totp.enroll",
        "version": "1.0",
        "requesttime": iso_now(),
        "request": {"individualId": individual_id},
    }
    code, enroll_json = http_json(
        f"{UPSTREAM_BASE}/totp/enroll",
        method="POST",
        body=enroll_body,
        headers=headers,
        auth=(RESIDENT_USER, RESIDENT_PASS),
        cookie_jar=jar,
    )
    if code >= 400 or not (enroll_json.get("response") or {}).get("secretKey"):
        msg = "TOTP enrollment failed."
        errs = enroll_json.get("errors") or []
        if errs:
            msg = errs[0].get("message") or errs[0].get("errorCode") or msg
        return code if code >= 400 else 502, fail_payload("totp_enroll_failed", msg)

    resp = enroll_json["response"]
    secret = resp["secretKey"]
    session_id = resp.get("sessionId") or ""
    algo = resp.get("algorithm") or "SHA256"
    digits = int(resp.get("otpLength") or 6)
    step = int(resp.get("totpTimeStep") or 30)
    otpauth = save_secret(secret, individual_id, algo, digits, step)
    secret_nopad = re.sub(r"[=\\s]", "", secret).upper()
    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data="
        + urllib.parse.quote(otpauth, safe="")
    )

    return 200, json.dumps(
        {
            "response": {
                "status": "pending",
                "individualId": individual_id,
                "sessionId": session_id,
                "algorithm": algo,
                "digits": digits,
                "step": step,
                "otpauthUri": otpauth,
                "qrCodeUrl": qr_url,
                "secretMasked": secret_nopad[:4] + "****" + secret_nopad[-4:],
                "manualEntryKey": secret_nopad,
            },
            "errors": [],
        }
    ).encode()


def confirm_totp(individual_id: str, session_id: str, code: str) -> tuple[int, bytes]:
    jar = http.cookiejar.CookieJar()
    _, time_json = http_json(f"{UPSTREAM_BASE}/totp/time", cookie_jar=jar)
    xsrf = ""
    for cookie in jar:
        if cookie.name == "XSRF-TOKEN":
            xsrf = cookie.value
    headers = {}
    if xsrf:
        headers["X-XSRF-TOKEN"] = xsrf

    req_inner = {"individualId": individual_id, "code": code}
    if session_id:
        req_inner["sessionId"] = session_id
    confirm_body = {
        "id": "fayda.identity.totp.verify-enrollment",
        "version": "1.0",
        "requesttime": iso_now(),
        "request": req_inner,
    }
    status, confirm_json = http_json(
        f"{UPSTREAM_BASE}/totp/verify-enrollment",
        method="POST",
        body=confirm_body,
        headers=headers,
        auth=(RESIDENT_USER, RESIDENT_PASS),
        cookie_jar=jar,
    )
    ok = ((confirm_json.get("response") or {}).get("status") or "").lower() == "success"
    if status >= 400 or not ok:
        msg = "Could not confirm TOTP enrollment."
        errs = confirm_json.get("errors") or []
        if errs:
            msg = errs[0].get("message") or errs[0].get("errorCode") or msg
        return status if status >= 400 else 400, fail_payload("totp_confirm_failed", msg)

    return 200, json.dumps(
        {
            "response": {
                "status": "success",
                "message": "TOTP enrollment completed. You can log in with your authenticator app.",
                "individualId": individual_id,
            },
            "errors": [],
        }
    ).encode()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode() or "{}")
        except Exception:
            return {}

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/local/totp/health"):
            payload = json.dumps({"status": "ok", "secretLoaded": load_secret() is not None}).encode()
            self._json(200, payload)
            return
        self.send_error(404)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        body = self._read_json()
        req = body.get("request") or body

        if path == "/local/totp/enroll":
            individual_id = str(req.get("individualId") or POC_BOUND_ID)
            code, payload = enroll_totp(individual_id)
            self._json(code, payload)
            return

        if path == "/local/totp/confirm":
            individual_id = str(req.get("individualId") or POC_BOUND_ID)
            session_id = str(req.get("sessionId") or "")
            code_val = str(req.get("code") or "")
            status, payload = confirm_totp(individual_id, session_id, code_val)
            self._json(status, payload)
            return

        if path.endswith("/totp/verify") or path == "/v1/totp/verify":
            self._handle_verify(body, req)
            return

        self.send_error(404)

    def _handle_verify(self, body: dict, req: dict):
        totp = str(req.get("totp") or "")
        individual_id = str(req.get("individualId") or "")

        # Dev-only bypass. Default is OFF so Google Authenticator / Fayda verify is required.
        if totp == MOCK_OTP and ALLOW_MOCK_OTP:
            print("ALLOW_MOCK_TOTP: accepting mock code for", individual_id)
            self._json(200, success_payload("Local mock TOTP accepted."))
            return

        # Prefer live Fayda verifier first (covers codes enrolled in Google Authenticator).
        raw = json.dumps(body).encode()
        upstream_req = urllib.request.Request(UPSTREAM_VERIFY, data=raw, method="POST")
        upstream_req.add_header(
            "Content-Type", self.headers.get("Content-Type") or "application/json"
        )
        auth = self.headers.get("Authorization")
        if not auth:
            auth = "Basic " + base64.b64encode(
                f"{VERIFY_USER}:{VERIFY_PASS}".encode()
            ).decode()
        upstream_req.add_header("Authorization", auth)

        msgs = {
            "totp_expired": "Your Fayda TOTP code has expired. Enter the latest code.",
            "totp_not_enrolled": "Fayda TOTP is not set up for this FAN. Register TOTP first.",
            "totp_invalid": "Incorrect Fayda TOTP code. Please try again.",
        }

        try:
            with urllib.request.urlopen(
                upstream_req, timeout=8, context=SSL_CTX
            ) as resp:
                payload = resp.read()
                if resp.status == 200:
                    try:
                        parsed = json.loads(payload.decode())
                        status = (
                            (parsed.get("response") or {}).get("status") or ""
                        ).lower()
                        if status == "success":
                            self._raw(
                                resp.status, resp.headers.get("Content-Type"), payload
                            )
                            return
                        up_errs = parsed.get("errors") or []
                        if up_errs:
                            code = str(up_errs[0].get("errorCode") or "totp_invalid")
                            msg = str(up_errs[0].get("message") or msgs.get(code, code))
                            # Normalize common upstream codes to UI-friendly ones
                            if "expir" in code.lower() or "expir" in msg.lower():
                                code = "totp_expired"
                            elif "enroll" in code.lower() or "not.?set" in msg.lower():
                                code = "totp_not_enrolled"
                            elif code not in msgs:
                                code = "totp_invalid"
                            self._json(401, fail_payload(code, msgs.get(code, msg)))
                            return
                    except Exception:
                        pass
        except urllib.error.HTTPError as e:
            try:
                parsed = json.loads(e.read().decode() or "{}")
                up_errs = parsed.get("errors") or []
                if up_errs:
                    code = str(up_errs[0].get("errorCode") or "totp_invalid")
                    msg = str(up_errs[0].get("message") or msgs.get(code, code))
                    if "expir" in code.lower() or "expir" in msg.lower():
                        code = "totp_expired"
                    elif "enroll" in code.lower():
                        code = "totp_not_enrolled"
                    elif code not in msgs:
                        code = "totp_invalid"
                    # Fall through to local GA check before failing hard
                    local_msg = local_totp_match(individual_id, totp)
                    if local_msg:
                        print(
                            "local match after upstream reject:",
                            individual_id,
                            totp[:2] + "****",
                        )
                        self._json(200, success_payload(local_msg))
                        return
                    self._json(401, fail_payload(code, msgs.get(code, msg)))
                    return
            except Exception:
                pass
        except Exception as e:
            print("verify upstream failed:", e)

        # Fallback: local Google Authenticator secret from enroll flow (if present)
        local_msg = local_totp_match(individual_id, totp)
        if local_msg:
            print("local match:", individual_id, totp[:2] + "****", local_msg)
            self._json(200, success_payload(local_msg))
            return

        err = classify_failure(individual_id, totp)
        self._json(401, fail_payload(err, msgs.get(err, err)))

    def _json(self, code: int, payload: bytes):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _raw(self, code: int, ctype, payload: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype or "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    cfg = load_secret()
    print("TOTP proxy on :8099")
    print("  verify ->", UPSTREAM_VERIFY)
    print("  enroll ->", UPSTREAM_BASE + "/totp/enroll")
    print("  local    POST /local/totp/enroll, /local/totp/confirm")
    print("Secret file:", SECRET_FILE, "(loaded)" if cfg else "(missing)")
    if cfg:
        print("  individualId:", cfg.get("individual_id"), "algo:", cfg.get("algo"))
    bind = os.environ.get("TOTP_PROXY_BIND", "0.0.0.0")
    port = int(os.environ.get("TOTP_PROXY_PORT", "8099"))
    ThreadingHTTPServer((bind, port), Handler).serve_forever()
