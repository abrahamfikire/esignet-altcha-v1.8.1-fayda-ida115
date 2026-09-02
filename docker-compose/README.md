## Overview

This is the docker compose setup to run esignet UI and esignet-service with mock identity system. This is not for production use.

### VPN / port conflicts (govvpn + report.fayda.et)

Govvpn routes **`172.16.0.0/12`** (and other RFC1918 ranges) through **`tun0`**.  
If Docker creates a bridge on **`172.18.0.0/16`**, Linux sends **`report.fayda.et`** (`172.18.10.42`) to Docker instead of the VPN → **`ERR_ADDRESS_UNREACHABLE`**.

**Fix (one time after pulling these changes):**

```bash
cd docker-compose
docker rm -f oidc-ui 2>/dev/null || true
docker compose down
docker compose -f dependent-docker-compose.yml down
docker network rm verifayda-local docker-compose_default 2>/dev/null || true
./scripts/ensure-docker-network.sh
docker compose -f dependent-docker-compose.yml up -d
```

Verify routing (must show **`dev tun0`**, not `br-...`):

```bash
ip route get $(getent hosts report.fayda.et | awk '{print $1}')
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 5 https://report.fayda.et/
```

Docker subnets used: **`198.18.50.0/24`** (verifayda-local), **`198.18.51.0/24`** (compose default) — outside govvpn ranges.

## I am a developer, how to setup dependent services to edit and test esignet-service?

1. Open terminal and go to "docker-compose" folder.
2. Run `docker compose --file dependent-docker-compose.yml up` to start all the dependent services.
3. Go to [esignet-with-plugins](../esignet-with-plugins) folder and run `mvn clean install -Dgpg.skip=true` from the command line.
4. Add [esignet-mock-plugin.jar](../esignet-with-plugins/target/esignet-mock-plugin.jar) to esignet-service classpath in your IDE.
5. Start the [EsignetServiceApplication.java](../esignet-service/src/main/java/io/mosip/esignet/EsignetServiceApplication.java) from your IDE.
6. Import files under [postman-collection](../postman-collection) folder into your postman to test/validate OIDC flow.

## VeriFayda local (working UI image + artifactory)

Use the published VeriFayda UI image (not stock `mosipid/oidc-ui`):

```bash
docker pull amanijo/oidc-ui:v1.8.x-verifayda-latest
cd docker-compose
chmod +x start-verifayda-local.sh
./start-verifayda-local.sh
```

| Service | Role |
| --- | --- |
| `artifactory` | VeriFayda i18n/theme/image zips on `:8080` |
| `esignet` | TOTP-patched mock plugin + `faydapass-code` ACR |
| `esignet-ui` | **`amanijo/oidc-ui:v1.8.x-verifayda-latest`** (VeriFayda Code / TOTP) and fetches artifactory zips on start |

Sync image assets into this repo’s `oidc-ui/` (build + public):

```bash
./scripts/pull-and-sync-verifayda-oidc-ui.sh
```

TOTP option label in the working image: **VeriFayda Code** (icon: `/images/faydapass_icon.svg`).

## How to bring up the complete eSignet setup for a Demo?

1. Open terminal and go to "docker-compose" folder.
2. Prefer `./start-verifayda-local.sh` (VeriFayda). Or `docker compose up` for stock MOSIP demo only.
3. Access eSignet UI at http://localhost:3000
4. Access eSignet backend services at http://localhost:8088/v1/esignet/swagger-ui.html
5. Onboard relying party in eSignet, import all files under [postman-collection](../postman-collection) folder into your postman. Choose `eSignet-with-mock` environment in the postman and invoke below requests under `OIDC Client Mgmt` -> `Mock` folder in postman.
   
    a. `Get CSRF token`

    b. `Create OIDC client` -> Make sure to update redirect Urls and logo URL as per your requirement in the request body.

6. Copy the client ID in the `Create OIDC client` response.
7. Add a `SignIn with eSignet` button in the relying party website and embed [eSignet authorize URL](http://localhost:3000/authorize?nonce=ere973eieljznge2311&state=eree2311&client_id=client_id&redirect_uri=redirect_uri&scope=openid&response_type=code&acr_values=mosip:idp:acr:generated-code&claims_locales=en&ui_locales=en-IN) in the button. Update the below query parameter in the eSignet authorize URL before embedding in the button.

   a. `client_id` -> value should be replace with the value copied in the step 6

   b. `redirect_uri` -> As updated in step 5

8. Add a user in the mock-identity-system. Invoke `Creat User` request under `User Mgmt` -> `Mock` folder in the postman. 
9. Now the setup is completely ready to start the OIDC flow. [Refer eSignet user guides](https://docs.esignet.io/test/end-user-guide) for more information.

`Note: To know more about the relying party onboard and query parameters used in the eSignet authorize URL `[refer eSignet docs](https://docs.esignet.io/integration/relying-party)

## How to add user identity in the mock-identity-system?

1. Import files under [postman-collection](../postman-collection) folder into your postman. And invoke requests under `User Mgmt/Mock` folder in postman.

## Local userinfo JWE (encryption) setup

By default, local E2E can use `additional_config.userinfo_response_type=JWS` (signed JWT only).
To return **encrypted userinfo (JWE)** instead, the relying party must register an **encryption** public key on the OIDC client.

Signing key (`client_detail.public_key` / demo `PRIVATE_KEY`) and encryption key (`enc_public_key` / demo `PRIVATE_KEY_USER_INFO`) must be **different** key pairs.

### What eSignet stores on the client

| Column / config | Purpose |
| --- | --- |
| `enc_public_key` | Public JWK JSON (`kty=RSA`, `use=enc`, `alg=RSA-OAEP-256`, plus `n`/`e`/`kid`) |
| `enc_public_key_hash` | SHA-256 hex digest of the JWK `n` field (same rule as eSignet `computePublicKeyHash`) |
| `enc_public_key_cert` | Self-signed X.509 PEM built from that public key — eSignet encrypts userinfo with this cert |
| `additional_config.userinfo_response_type` | Must be `JWE` |

On the relying-party app:

- `PRIVATE_KEY` — RSA private JWK used to sign `client_assertion` (token endpoint)
- `PRIVATE_KEY_USER_INFO` — RSA private JWK (base64 of JSON) used to decrypt the 5-part compact JWE from `/oidc/userinfo`

### How `enc_public_key` was generated

We generated a fresh RSA-2048 encryption keypair with [jwcrypto](https://jwcrypto.readthedocs.io/), then derived a PEM certificate with [cryptography](https://cryptography.io/).

Dependencies:

```bash
pip install jwcrypto cryptography
```

Core generation (same logic as `scripts/setup-local-jwe-userinfo.py`):

```python
import base64, hashlib, json, datetime as dt
from jwcrypto import jwk
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key

# 1) RSA encryption keypair as JWK
key = jwk.JWK.generate(kty="RSA", size=2048, use="enc", alg="RSA-OAEP-256")
kid = key.thumbprint()
key["kid"] = kid

priv = json.loads(key.export(private_key=True))   # stays on RP only
pub  = json.loads(key.export(private_key=False))  # -> enc_public_key
priv.update({"use": "enc", "alg": "RSA-OAEP-256", "kid": kid})
pub.update({"use": "enc", "alg": "RSA-OAEP-256", "kid": kid})

enc_public_key = json.dumps(pub, separators=(",", ":"))

# 2) Hash used by eSignet (SHA-256 hex of JWK "n")
enc_public_key_hash = hashlib.sha256(pub["n"].encode("utf-8")).hexdigest()

# 3) Self-signed PEM cert (eSignet jwtEncrypt uses this)
pem_priv = key.export_to_pem(private_key=True, password=None)
pem_pub = jwk.JWK.from_json(json.dumps(pub)).export_to_pem()
private_key = load_pem_private_key(pem_priv, password=None)
public_key = load_pem_public_key(pem_pub)

now = dt.datetime.now(dt.timezone.utc)
name = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, "esignet-local-enc"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "local-test"),
])
cert = (
    x509.CertificateBuilder()
    .subject_name(name)
    .issuer_name(name)
    .public_key(public_key)
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - dt.timedelta(minutes=1))
    .not_valid_after(now + dt.timedelta(days=3650))
    .sign(private_key, hashes.SHA256())
)
enc_public_key_cert = cert.public_bytes(serialization.Encoding.PEM).decode()

# 4) Value for demo .env PRIVATE_KEY_USER_INFO
private_key_user_info_b64 = base64.b64encode(
    json.dumps(priv, separators=(",", ":")).encode()
).decode()
```

Example shape of `enc_public_key` (fields only; values truncated):

```json
{
  "kty": "RSA",
  "use": "enc",
  "alg": "RSA-OAEP-256",
  "kid": "<thumbprint>",
  "n": "<base64url-modulus>",
  "e": "AQAB"
}
```

### One-command helper (recommended)

```bash
cd docker-compose
python3 scripts/setup-local-jwe-userinfo.py \
  --client-id <YOUR_CLIENT_ID> \
  --apply-db \
  --db-host 127.0.0.1 --db-port 5432 \
  --db-name mosip_esignet --db-user postgres --db-password <DB_PASSWORD>
```

That script:

1. Generates the keypair + PEM cert as above
2. Writes artifacts under `docker-compose/local-jwe-keys/` (gitignored)
3. With `--apply-db`, updates `esignet.client_detail`:
   - `enc_public_key`, `enc_public_key_hash`, `enc_public_key_cert`
   - `additional_config.userinfo_response_type = JWE`

Artifacts:

| File | Who uses it |
| --- | --- |
| `enc_public.jwk.json` | Stored as `client_detail.enc_public_key` |
| `enc_public.cert.pem` | Stored as `client_detail.enc_public_key_cert` |
| `enc_private.jwk.json` | RP private material (do not commit) |
| `PRIVATE_KEY_USER_INFO.b64.txt` | Paste into demo `.env` as `PRIVATE_KEY_USER_INFO` |

### Wire the demo app

In the demo `.env`:

```env
PRIVATE_KEY_USER_INFO=<paste contents of local-jwe-keys/PRIVATE_KEY_USER_INFO.b64.txt>
```

Restart the demo app so it reloads `.env`.

### Restart eSignet

Local profile uses `spring.cache.type=simple` with a long `clientdetails` TTL, so **restart eSignet** after changing `client_detail` or the old JWS/JWE setting stays cached.

### Verify JWE is active

1. Start a **fresh** login (do not reuse an old callback URL).
2. After token exchange, `/oidc/userinfo` should return a **5-segment** compact token (`header.encrypted_key.iv.ciphertext.tag`).
3. eSignet logs should include `Encrypting JWS into JWE` (and must **not** say `Client encryption public key certificate is not configured`).
4. Demo logs should include `Userinfo is JWE; decrypting with PRIVATE_KEY_USER_INFO`.
5. Optional: open `userinfo_responses/last_userinfo_format.json` in the demo project — `format` / `jwe_working` should reflect JWE success.

### Switch back to JWS

```sql
UPDATE esignet.client_detail
SET additional_config = (
  jsonb_set(
    COALESCE(NULLIF(BTRIM(additional_config), '')::jsonb, '{}'::jsonb),
    '{userinfo_response_type}',
    '"JWS"'::jsonb,
    true
  )
)::text
WHERE id = '<YOUR_CLIENT_ID>';
```

Then restart eSignet again.
