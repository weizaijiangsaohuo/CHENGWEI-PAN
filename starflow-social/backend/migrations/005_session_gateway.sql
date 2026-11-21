-- Trusted server gateway only. No account creation, legacy claim, or browser SQL.
BEGIN;
CREATE ROLE sf_session_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA sf_core TO sf_session_gateway;
GRANT sf_profile_runtime TO sf_session_gateway;
CREATE FUNCTION sf_core.resolve_auth_subject(p_subject uuid) RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT b.principal_id FROM sf_core.auth_bindings b WHERE b.auth_subject=p_subject
$$;
REVOKE ALL ON FUNCTION sf_core.resolve_auth_subject(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.resolve_auth_subject(uuid) TO sf_session_gateway;
COMMIT;
