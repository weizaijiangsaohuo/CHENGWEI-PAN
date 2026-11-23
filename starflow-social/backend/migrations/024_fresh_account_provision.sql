-- Isolated CI only until a trusted registration admission issuer and rollout are reviewed.
BEGIN;
CREATE ROLE sf_fresh_account_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA sf_core TO sf_fresh_account_gateway;
-- Only the migration owner can create admissions. No app/registration route can write them.
CREATE TABLE sf_core.fresh_registration_admissions(
 auth_subject uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '15 minutes'),
 CHECK(consumed_at IS NULL OR (consumed_at>=issued_at AND consumed_at<expires_at))
);
ALTER TABLE sf_core.fresh_registration_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.fresh_registration_admissions FROM PUBLIC;
CREATE FUNCTION sf_core.provision_fresh_account(p_subject uuid,p_session uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h text; new_id uuid; t timestamptz;
BEGIN
 -- Subject must be admitted by a trusted new-signup ceremony, not a legacy import.
 PERFORM 1 FROM sf_core.fresh_registration_admissions
 WHERE auth_subject=p_subject AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT u.username INTO h FROM public."user" u
 WHERE u.id=p_subject AND u."emailVerified" IS TRUE FOR UPDATE;
 IF NOT FOUND OR h IS NULL OR h !~ '^[a-z0-9_]{3,24}$' THEN RETURN NULL; END IF;
 PERFORM 1 FROM public."session" s WHERE s.id=p_session AND s."userId"=p_subject AND s."expiresAt">clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM sf_core.auth_bindings WHERE auth_subject=p_subject) THEN RETURN NULL; END IF;
 t:=clock_timestamp();
 UPDATE sf_core.fresh_registration_admissions SET consumed_at=t
 WHERE auth_subject=p_subject AND consumed_at IS NULL AND issued_at<=t AND expires_at>t;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO sf_core.principals DEFAULT VALUES RETURNING id INTO new_id;
 INSERT INTO sf_core.profiles(id,handle) VALUES(new_id,h);
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(new_id,p_subject);
 -- No role, staff, recovery, identity badge, old media or old profile grant.
 RETURN new_id;
EXCEPTION WHEN unique_violation THEN
 -- Entire function block rolls back on handle/binding collision; never claim old principal.
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sf_core.provision_fresh_account(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.provision_fresh_account(uuid,uuid) TO sf_fresh_account_gateway;
COMMIT;
