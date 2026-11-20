-- Dedicated trusted review gateway, not the general app runtime.
BEGIN;
CREATE ROLE sf_review_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA sf_core TO sf_review_gateway;
GRANT EXECUTE ON FUNCTION sf_core.resolve_auth_subject(uuid) TO sf_review_gateway;
-- Existing functions have fixed pg_catalog search_path, fully-qualified table references,
-- enabled staff roles, session-bound single-use MFA proof and atomic audit.
ALTER FUNCTION sf_core.open_review_queue(uuid,uuid,uuid,int) SECURITY DEFINER;
ALTER FUNCTION sf_core.review_community_report(uuid,uuid,uuid,uuid,text) SECURITY DEFINER;
REVOKE ALL ON FUNCTION sf_core.open_review_queue(uuid,uuid,uuid,int),sf_core.review_community_report(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.open_review_queue(uuid,uuid,uuid,int),sf_core.review_community_report(uuid,uuid,uuid,uuid,text) TO sf_review_gateway;
COMMIT;
