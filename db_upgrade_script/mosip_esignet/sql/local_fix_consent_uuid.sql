SET search_path TO esignet, public;

-- eSignet 1.8 expects varchar IDs; dumped DB still has uuid
ALTER TABLE consent_detail
  ALTER COLUMN id TYPE varchar(36) USING id::text;
ALTER TABLE consent_history
  ALTER COLUMN id TYPE varchar(36) USING id::text;

ALTER TABLE consent_detail ALTER COLUMN client_id TYPE varchar(256);
ALTER TABLE consent_detail ALTER COLUMN psu_token TYPE varchar(256);
ALTER TABLE consent_detail ALTER COLUMN claims TYPE varchar(2048);
ALTER TABLE consent_detail ALTER COLUMN authorization_scopes TYPE varchar(1024);
ALTER TABLE consent_detail ALTER COLUMN signature TYPE varchar(1024);
ALTER TABLE consent_detail ALTER COLUMN hash TYPE varchar(100);
ALTER TABLE consent_detail ALTER COLUMN accepted_claims TYPE varchar(1024);
ALTER TABLE consent_detail ALTER COLUMN permitted_scopes TYPE varchar(1024);

ALTER TABLE consent_history ALTER COLUMN client_id TYPE varchar(256);
ALTER TABLE consent_history ALTER COLUMN psu_token TYPE varchar(256);
ALTER TABLE consent_history ALTER COLUMN claims TYPE varchar(2048);
ALTER TABLE consent_history ALTER COLUMN authorization_scopes TYPE varchar(1024);
ALTER TABLE consent_history ALTER COLUMN signature TYPE varchar(1024);
ALTER TABLE consent_history ALTER COLUMN hash TYPE varchar(100);
ALTER TABLE consent_history ALTER COLUMN accepted_claims TYPE varchar(1024);
ALTER TABLE consent_history ALTER COLUMN permitted_scopes TYPE varchar(1024);
