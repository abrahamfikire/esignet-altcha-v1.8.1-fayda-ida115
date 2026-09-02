#!/usr/bin/env python3
"""
Generate an RSA encryption JWK pair for eSignet userinfo JWE and optionally
register it on a local client_detail row.

Usage (from repo root or this directory):
  python3 docker-compose/scripts/setup-local-jwe-userinfo.py \\
    --client-id y2eznKdEGjXM0gRTrpbgbwVi4N2NoCxR4bZRh0BMPoE \\
    --apply-db \\
    --db-host 127.0.0.1 --db-port 5432 --db-name mosip_esignet \\
    --db-user postgres --db-password 1748

Then set in the relying-party demo .env:
  PRIVATE_KEY_USER_INFO=<contents of local-jwe-keys/PRIVATE_KEY_USER_INFO.b64.txt>

Restart eSignet (clears in-memory clientdetails cache) and the demo app.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

try:
    from jwcrypto import jwk
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import (
        load_pem_private_key,
        load_pem_public_key,
    )
    from cryptography.x509.oid import NameOID
except ImportError as exc:
    raise SystemExit(
        "Missing dependency. Install with: pip install jwcrypto cryptography\n"
        f"Import error: {exc}"
    )


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "local-jwe-keys"


def generate_keys() -> tuple[dict, dict, str, str]:
    key = jwk.JWK.generate(kty="RSA", size=2048, use="enc", alg="RSA-OAEP-256")
    kid = key.thumbprint()
    key["kid"] = kid

    priv = json.loads(key.export(private_key=True))
    pub = json.loads(key.export(private_key=False))
    priv.update({"use": "enc", "alg": "RSA-OAEP-256", "kid": kid})
    pub.update({"use": "enc", "alg": "RSA-OAEP-256", "kid": kid})

    pem_priv = key.export_to_pem(private_key=True, password=None)
    pem_pub = jwk.JWK.from_json(json.dumps(pub)).export_to_pem()
    private_key = load_pem_private_key(pem_priv, password=None)
    public_key = load_pem_public_key(pem_pub)

    now = dt.datetime.now(dt.timezone.utc)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, "esignet-local-enc"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "local-test"),
        ]
    )
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=1))
        .not_valid_after(now + dt.timedelta(days=3650))
        .sign(private_key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    key_hash = hashlib.sha256(pub["n"].encode("utf-8")).hexdigest()
    return priv, pub, cert_pem, key_hash


def write_artifacts(priv: dict, pub: dict, cert_pem: str, key_hash: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "enc_private.jwk.json").write_text(json.dumps(priv, indent=2) + "\n")
    (OUT_DIR / "enc_public.jwk.json").write_text(json.dumps(pub, indent=2) + "\n")
    (OUT_DIR / "enc_public.cert.pem").write_text(cert_pem)
    b64 = base64.b64encode(json.dumps(priv, separators=(",", ":")).encode()).decode()
    (OUT_DIR / "PRIVATE_KEY_USER_INFO.b64.txt").write_text(b64 + "\n")
    (OUT_DIR / "hashes.txt").write_text(
        f"sha256_hex_of_n={key_hash}\nkid={pub.get('kid')}\n"
    )
    return OUT_DIR


def apply_db(
    client_id: str,
    pub: dict,
    cert_pem: str,
    key_hash: str,
    db_host: str,
    db_port: str,
    db_name: str,
    db_user: str,
    db_password: str,
) -> None:
    pub_compact = json.dumps(pub, separators=(",", ":"))

    def sq(s: str) -> str:
        return s.replace("'", "''")

    sql = f"""SET search_path TO esignet, public;
UPDATE client_detail
SET
  enc_public_key = '{sq(pub_compact)}',
  enc_public_key_hash = '{key_hash}',
  enc_public_key_cert = '{sq(cert_pem)}',
  additional_config = (
    jsonb_set(
      COALESCE(NULLIF(BTRIM(additional_config), '')::jsonb, '{{}}'::jsonb),
      '{{userinfo_response_type}}',
      '"JWE"'::jsonb,
      true
    )
  )::text
WHERE id = '{sq(client_id)}';

SELECT id,
       (additional_config::jsonb)->>'userinfo_response_type' AS userinfo_response_type,
       length(enc_public_key) AS enc_jwk_len,
       length(enc_public_key_cert) AS enc_cert_len
FROM client_detail
WHERE id = '{sq(client_id)}';
"""
    sql_path = Path("/tmp/enable_jwe_userinfo.sql")
    sql_path.write_text(sql)
    cmd = [
        "docker",
        "run",
        "--rm",
        "--network",
        "host",
        "-e",
        f"PGPASSWORD={db_password}",
        "-v",
        f"{sql_path}:/sql/enable_jwe_userinfo.sql",
        "postgres:bookworm",
        "psql",
        "-h",
        db_host,
        "-p",
        db_port,
        "-U",
        db_user,
        "-d",
        db_name,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "/sql/enable_jwe_userinfo.sql",
    ]
    subprocess.check_call(cmd)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--apply-db", action="store_true")
    parser.add_argument("--db-host", default="127.0.0.1")
    parser.add_argument("--db-port", default="5432")
    parser.add_argument("--db-name", default="mosip_esignet")
    parser.add_argument("--db-user", default="postgres")
    parser.add_argument("--db-password", default="1748")
    parser.add_argument(
        "--reuse-existing",
        action="store_true",
        help="Reuse keys already in docker-compose/local-jwe-keys if present",
    )
    args = parser.parse_args()

    if args.reuse_existing and (OUT_DIR / "enc_public.jwk.json").exists():
        pub = json.loads((OUT_DIR / "enc_public.jwk.json").read_text())
        priv = json.loads((OUT_DIR / "enc_private.jwk.json").read_text())
        cert_pem = (OUT_DIR / "enc_public.cert.pem").read_text()
        key_hash = hashlib.sha256(pub["n"].encode("utf-8")).hexdigest()
        write_artifacts(priv, pub, cert_pem, key_hash)
        print(f"Reused keys in {OUT_DIR}")
    else:
        priv, pub, cert_pem, key_hash = generate_keys()
        write_artifacts(priv, pub, cert_pem, key_hash)
        print(f"Generated keys in {OUT_DIR}")

    if args.apply_db:
        apply_db(
            args.client_id,
            pub,
            cert_pem,
            key_hash,
            args.db_host,
            args.db_port,
            args.db_name,
            args.db_user,
            args.db_password,
        )
        print("Registered enc public key + userinfo_response_type=JWE on client_detail")

    print(
        "\nNext:\n"
        "  1) Set PRIVATE_KEY_USER_INFO in demo .env to the contents of:\n"
        f"     {OUT_DIR / 'PRIVATE_KEY_USER_INFO.b64.txt'}\n"
        "  2) Restart eSignet (clears clientdetails cache) and restart the demo app\n"
        "  3) Complete a fresh login; userinfo should be a 5-part JWE compact token\n"
        "  4) Demo logs should show: 'Userinfo is JWE; decrypting with PRIVATE_KEY_USER_INFO'\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
