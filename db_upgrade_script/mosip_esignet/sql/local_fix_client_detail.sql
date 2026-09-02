SET search_path TO esignet, public;

CREATE OR REPLACE FUNCTION esignet.compute_public_key_hash(jwk_data jsonb)
RETURNS varchar AS $_func$
DECLARE
    key_type varchar;
    data_to_hash varchar;
    n_value varchar;
    x_value varchar;
    y_value varchar;
BEGIN
    key_type := jwk_data->>'kty';
    IF key_type IS NULL THEN
        RAISE EXCEPTION 'Missing kty field in JWK';
    END IF;
    IF key_type = 'RSA' THEN
        n_value := jwk_data->>'n';
        IF n_value IS NULL THEN RAISE EXCEPTION 'Missing n field in RSA JWK'; END IF;
        data_to_hash := n_value;
    ELSIF key_type = 'EC' THEN
        x_value := jwk_data->>'x';
        y_value := jwk_data->>'y';
        IF x_value IS NULL OR y_value IS NULL THEN RAISE EXCEPTION 'Missing x or y field in EC JWK'; END IF;
        data_to_hash := x_value || y_value;
    ELSE
        RAISE EXCEPTION 'Unsupported key type: %', key_type;
    END IF;
    RETURN encode(sha256(data_to_hash::bytea), 'hex');
END;
$_func$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS unique_n_value;

ALTER TABLE client_detail ADD COLUMN IF NOT EXISTS public_key_hash varchar(128);
ALTER TABLE client_detail ADD COLUMN IF NOT EXISTS enc_public_key varchar(1024);
ALTER TABLE client_detail ADD COLUMN IF NOT EXISTS enc_public_key_hash varchar(128);
ALTER TABLE client_detail ADD COLUMN IF NOT EXISTS enc_public_key_cert varchar(4000);

UPDATE client_detail
SET public_key_hash = esignet.compute_public_key_hash(public_key::jsonb)
WHERE public_key_hash IS NULL AND public_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uk_clntdtl_public_key_hash'
  ) THEN
    ALTER TABLE client_detail ADD CONSTRAINT uk_clntdtl_public_key_hash UNIQUE (public_key_hash);
  END IF;
END$$;

ALTER TABLE client_detail
    ALTER COLUMN public_key TYPE varchar(1024)
    USING public_key::text;

ALTER TABLE client_detail ALTER COLUMN public_key_hash SET NOT NULL;

ALTER TABLE client_detail ALTER COLUMN additional_config TYPE varchar(2048)
    USING CASE WHEN additional_config IS NULL THEN NULL ELSE additional_config::text END;

CREATE TABLE IF NOT EXISTS ca_cert_store(
	cert_id varchar(36) NOT NULL,
	cert_subject varchar(500) NOT NULL,
	cert_issuer varchar(500) NOT NULL,
	issuer_id varchar(36) NOT NULL,
	cert_not_before timestamp,
	cert_not_after timestamp,
	crl_uri varchar(120),
	cert_data varchar(4000),
	cert_thumbprint varchar(100),
	cert_serial_no varchar(50),
	partner_domain varchar(36),
	cr_by varchar(256),
	cr_dtimes timestamp,
	upd_by varchar(256),
	upd_dtimes timestamp,
	is_deleted boolean DEFAULT FALSE,
	del_dtimes timestamp,
	ca_cert_type varchar(25),
	CONSTRAINT pk_cacs_id PRIMARY KEY (cert_id)
);

CREATE TABLE IF NOT EXISTS server_profile (
    profile_name VARCHAR(100) NOT NULL,
    feature VARCHAR(100) NOT NULL,
    additional_config_key VARCHAR(200) NOT NULL,
    CONSTRAINT pk_server_profile PRIMARY KEY (profile_name, feature)
);

INSERT INTO server_profile(profile_name, feature, additional_config_key)
VALUES ('fapi2.0', 'PAR', 'require_pushed_authorization_requests')
ON CONFLICT DO NOTHING;
INSERT INTO server_profile(profile_name, feature, additional_config_key)
VALUES ('fapi2.0', 'DPOP', 'dpop_bound_access_tokens')
ON CONFLICT DO NOTHING;
INSERT INTO server_profile(profile_name, feature, additional_config_key)
VALUES ('fapi2.0', 'PKCE', 'require_pkce')
ON CONFLICT DO NOTHING;

UPDATE client_detail
SET redirect_uris = (
  CASE
    WHEN redirect_uris::text LIKE '%http://localhost:8000/callback%' THEN redirect_uris::text
    ELSE regexp_replace(redirect_uris::text, '\]\s*$', ', "http://localhost:8000/callback"]')
  END
)
WHERE id = 'y2eznKdEGjXM0gRTrpbgbwVi4N2NoCxR4bZRh0BMPoE';

DROP FUNCTION IF EXISTS esignet.compute_public_key_hash(jsonb);
