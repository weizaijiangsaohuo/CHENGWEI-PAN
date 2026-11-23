-- Apply only after generated Better Auth tables and migrations 001-011 exist.
-- These are NOLOGIN roles. Provision credentials separately only after preview gates.
BEGIN;
CREATE ROLE sf_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB
 NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE sf_business_connect NOLOGIN NOSUPERUSER NOCREATEDB
 NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
DO $$
BEGIN
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO sf_auth_runtime,sf_business_connect',current_database());
END $$;
GRANT USAGE ON SCHEMA public TO sf_auth_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 public."user",public."session",public."account",public."verification",
 public."twoFactor",public."passkey",public."rateLimit" TO sf_auth_runtime;
GRANT sf_session_gateway TO sf_business_connect WITH SET TRUE, INHERIT FALSE;
COMMIT;
