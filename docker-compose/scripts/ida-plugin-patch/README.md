# Fayda lab overlay (IDA 1.1.5)

Use this overlay **only** on the Fayda test cluster (IDA **1.1.5**, Postgres `consent_detail.id` / `consent_history.id` as `uuid`, legacy consent `userinfo` objects).

Do **not** apply it on stock MOSIP 1.8 with IDA **1.2.0.1**. That stack already has `kycToken` / `requestedAuth`, and consent ids are typically `varchar`. `CAST(:id AS uuid)` will break consent save there.

## What this overlay adds on top of Altcha

- IDA plugin class patches (`IdaAuthenticatorImpl`): UIN/VID from 12/16-digit ids, `requestedAuth`, `kycToken` fallback to `authToken`
- Consent compatibility: legacy claims JSON normalize; native delete by `client_id`+`psu_token`; native insert with `CAST(:id AS uuid)`
- Startup: `configure_start.sh` runs `ZipUpdater` after plugin wget; `patch_consent_jar.sh` rewrites nested `consent-service-impl` while keeping `BOOT-INF/lib` ZIP_STORED

## Stock MOSIP 1.8 + IDA 1.2.0.1

Build/deploy from branch `feature/esignet-1.8.0-altcha` (repo `esignet-altcha-v1.8.1`). Set Altcha HMAC secrets and `mosip.esignet.captcha.provider=altcha`. Leave this directory unused.
