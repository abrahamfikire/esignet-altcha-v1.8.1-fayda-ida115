# Altcha deploy: images and `esignet-default.properties`

Two lines share Altcha. They do **not** share the eSignet backend image.

| Cluster | Git | eSignet image | oidc-ui image |
|---|---|---|---|
| Stock MOSIP 1.8 + IDA **1.2.0.1** | [esignet-altcha-v1.8.1](https://github.com/abrahamfikire/esignet-altcha-v1.8.1) `feature/esignet-1.8.0-altcha` | `abraham555/esignet:1.8.0-altcha` | `abraham555/oidc-ui:1.8.0-altcha` |
| Fayda lab, IDA **1.1.5** | [esignet-altcha-v1.8.1-fayda-ida115](https://github.com/abrahamfikire/esignet-altcha-v1.8.1-fayda-ida115) | `abraham555/esignet:1.8.0-fayda-ida115` | `abraham555/oidc-ui:1.8.0-altcha` |

Do **not** point the 1.2.0.1 cluster at `1.8.0-fayda-ida115` or at `v1.8.1-altcha` / `v1.8.1-ida-overlay` (those were lab overlays). Fayda uuid consent inserts will break stock `varchar` consent ids.

Put the properties below in config-server **`esignet-default.properties`**. Restart eSignet after changing them.

---

## Redis (required if eSignet has more than one replica)

Keep stock MOSIP Redis. Do **not** set `spring.cache.type=simple`.

```properties
spring.cache.type=redis
spring.cache.cache-names=${mosip.esignet.cache.names}
spring.data.redis.host=${redis.host}
spring.data.redis.port=${redis.port}
spring.data.redis.password=${redis.password}
```

If this cluster already has those lines, leave them.

If you override `mosip.esignet.cache.names`, **append** `altcha` when captcha is on. Example (keep your existing names, only add `,altcha` at the end):

```properties
mosip.esignet.cache.names=clientdetails,preauth,authenticated,authcodegenerated,userinfo,linkcodegenerated,linked,linkedcode,linkedauth,consented,authtokens,bindingtransaction,apiratelimit,blocked,halted,nonce,par,jti,kbispec,altcha
```

`simple` is per-pod memory. Replica A issues the challenge; replica B validates login and captcha fails at random. Redis is shared.

---

## Captcha ON (Altcha)

```properties
mosip.esignet.captcha.provider=altcha
mosip.esignet.captcha.required=send-otp,pwd
mosip.esignet.altcha.hmac-secret=<at-least-32-random-chars>
mosip.esignet.altcha.hmac-key-secret=<different-at-least-32-random-chars>
```

Secrets must be **≥ 32 characters** or the pod will not start.

Optional (defaults are fine):

```properties
mosip.esignet.altcha.algorithm=PBKDF2/SHA-256
mosip.esignet.altcha.cost=5000
mosip.esignet.altcha.counter-min=5000
mosip.esignet.altcha.counter-max=10000
mosip.esignet.altcha.expires-in-seconds=600
```

You can keep the existing Google/site-key lines; Altcha does not use them:

```properties
mosip.esignet.captcha.site-key=${esignet.captcha.site.key}
mosip.esignet.captcha.validator-url=http://captcha.captcha/v1/captcha/validatecaptcha
mosip.esignet.captcha.module-name=esignet
```

### UI map (`mosip.esignet.ui.config.key-values`)

Do **not** replace the whole map. Add these two keys next to the existing `captcha.sitekey` / `captcha.enable` entries:

```properties
'captcha.provider' : '${mosip.esignet.captcha.provider:legacy}',
'captcha.challengeUrl' : '${mosip.esignet.domain.url}${server.servlet.path}/authorization/altcha/challenge',
```

Challenge URL resolves to `{esignet-public-url}/v1/esignet/authorization/altcha/challenge`.

---

## Captcha OFF

Same images are fine. In `esignet-default.properties`:

```properties
mosip.esignet.captcha.required=
mosip.esignet.captcha.provider=legacy
```

Empty `captcha.required` hides the widget and skips captcha checks. `provider=legacy` means HMAC secrets are **not** required at startup.

Leave Redis as-is. You do not need `altcha` on `cache.names` while provider is `legacy`.

To turn Altcha on later: set `provider=altcha`, put factors back on `captcha.required`, add the two HMAC secrets, and include `altcha` in `cache.names`.

---

## Fayda lab only (IDA 1.1.5)

Use `abraham555/esignet:1.8.0-fayda-ida115`. Captcha properties are the **same** as above.

That image also patches:

- IDA plugin: 12-digit FCN → UIN, 16-digit → VID, `requestedAuth`, `kycToken` fallback to `authToken`
- Consent: legacy `userinfo` JSON; native delete by `client_id`+`psu_token`; insert `CAST(:id AS uuid)`

Do not use those consent/plugin patches on IDA 1.2.0.1.

---

## CSRF / auth ignore URLs

The Altcha eSignet image already prefixes `/v1/esignet` in code. Do not copy lab `ignore-csrf-urls` / `ignore-auth-urls` onto a healthy 1.8 cluster unless you already know you need them.
