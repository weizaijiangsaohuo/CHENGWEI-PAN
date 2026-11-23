-- Tighten ordinary recovery preflight after fresh account admissions are installed.
-- This is not a face verification, reset token, or password update authorization.
BEGIN;
CREATE OR REPLACE FUNCTION sf_core.ordinary_recovery_allowed(p_subject uuid,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
 SELECT 1 FROM sf_core.auth_bindings b
 JOIN sf_core.account_recovery_policy r ON r.principal_id=b.principal_id
 JOIN public."user" u ON u.id=b.auth_subject
 JOIN sf_core.fresh_registration_admissions a ON a.auth_subject=b.auth_subject
 WHERE b.auth_subject=p_subject AND r.enabled AND u."emailVerified" IS TRUE
 AND u."twoFactorEnabled" IS FALSE
 AND a.consumed_at IS NOT NULL AND a.consumed_at>=a.issued_at AND a.consumed_at<a.expires_at
 AND (p_email IS NULL OR u.email=p_email)
 AND NOT EXISTS(SELECT 1 FROM sf_core.staff_roles s WHERE s.principal_id=b.principal_id)
 )
$$;
REVOKE ALL ON FUNCTION sf_core.ordinary_recovery_allowed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.ordinary_recovery_allowed(uuid,text) TO sf_account_recovery_gateway;
COMMIT;
