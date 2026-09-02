# TOTP enrollment + login verify

The oidc-ui **Login with TOTP Code** option is already shown when ACR `mosip:idp:acr:faydapass-code` is requested.

Enrollment and login verification use the Fayda TOTP services (from `/home/amani/Documents/totp-enrol`).

## Endpoints

Oracle1 (direct, no Mimoto):

```text
GET  https://totp.oracle1.fayda.et/v1/totp/time
POST https://totp.oracle1.fayda.et/v1/totp/enroll
POST https://totp.oracle1.fayda.et/v1/totp/verify-enrollment
POST https://totp.oracle1.fayda.et/v1/totp/verify
```

Staging (Mimoto proxy + public verify):

```text
GET  https://injiweb.test.fayda.et/v1/mimoto/totp/time
POST https://injiweb.test.fayda.et/v1/mimoto/totp/enroll
POST https://injiweb.test.fayda.et/v1/mimoto/totp/verify-enrollment
POST https://injiweb.test.fayda.et/v1/totp/verify
```

| Step | Endpoint | Purpose |
| --- | --- | --- |
| time | `GET …/totp/time` | Server epoch for TOTP code generation |
| enroll | `POST …/totp/enroll` | Pending session + secret |
| **verify-enrollment** | `POST …/totp/verify-enrollment` | Confirm first code → activate credential |
| verify | `POST …/totp/verify` | Login-time check (eSignet mock plugin can call this) |

## Quick enroll (verify-enrollment included)

```bash
cd docker-compose/scripts
BASE=https://totp.oracle1.fayda.et \
INDIVIDUAL_ID=1234567890123456 \
./totp-flow.sh
```

POC enroll credentials: `resident` / `fayda` (bound to `1234567890123456`).  
Verify credentials: `id-auth` / `fayda`.

`verify-enrollment` request shape:

```json
{
  "id": "fayda.identity.totp.verify-enrollment",
  "version": "1.0",
  "requesttime": "2026-08-31T00:00:00.000Z",
  "request": {
    "individualId": "1234567890123456",
    "sessionId": "<from enroll>",
    "code": "123456"
  }
}
```

Expected success:

```json
{
  "response": {
    "status": "success",
    "message": "Enrollment completed successfully."
  },
  "errors": []
}
```

## Wire login to real `/v1/totp/verify`

In `application-local.properties` (restart eSignet after change):

```properties
mosip.esignet.mock.authenticator.totp-verify-url=https://totp.oracle1.fayda.et/v1/totp/verify
mosip.esignet.mock.authenticator.totp-verify-username=id-auth
mosip.esignet.mock.authenticator.totp-verify-password=fayda
```

With that set, the patched mock plugin:

1. Calls `POST /v1/totp/verify` with FAN + TOTP from the UI  
2. On success, seeds mock-identity OTP and completes kyc-auth with `111111` internally  

Leave `totp-verify-url` empty to keep the old local-only path (enter `111111` in the TOTP UI against mock-identity FAN `3591483160130921`).

## Notes

- Do not mix clusters: enroll on oracle1 → verify on oracle1.  
- Enrollment subject mismatch (`KER-OTV-011`) means `resident` is bound to the POC ID only.  
- Source of the E2E script: `/home/amani/Documents/totp-enrol/` (`TOTP_DEVELOPER_E2E_TEST.md`, `totp-flow.sh`).
