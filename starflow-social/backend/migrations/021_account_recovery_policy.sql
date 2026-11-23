-- Explicit opt-in for ordinary verified accounts only. No public authentication route.
-- Install after Better Auth schema, 001, 006 and 012. Keep disabled until token redemption
-- and role/session mutation share a reviewed revocation protocol.
BEGIN;
CREATE ROLE sf_account_recovery_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT USAGE ON SCHEMA sf_core TO sf_account_recovery_gateway;
CREATE TABLE sf_core.account_recovery_policy(
 principal_id uuid PRIMARY KEY REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sf_core.account_recovery_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.account_recovery_policy FROM PUBLIC;
CREATE FUNCTION sf_core.ordinary_recovery_allowed(p_subject uuid,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
 SELECT 1 FROM sf_core.auth_bindings b
 JOIN sf_core.account_recovery_policy r ON r.principal_id=b.principal_id
 JOIN public."user" u ON u.id::text=b.auth_subject::text
 WHERE b.auth_subject=p_subject AND r.enabled AND u."emailVerified" IS TRUE
 AND u."twoFactorEnabled" IS FALSE
 AND (p_email IS NULL OR u.email=p_email)
 AND NOT EXISTS(SELECT 1 FROM sf_core.staff_roles s WHERE s.principal_id=b.principal_id)
 )
$$;
REVOKE ALL ON FUNCTION sf_core.ordinary_recovery_allowed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.ordinary_recovery_allowed(uuid,text) TO sf_account_recovery_gateway;
COMMIT;
