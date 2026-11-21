-- New signup admission issuer and read-only recipient check; no public route.
-- Apply only after 024. Owner creates the functions; dedicated gateway has no direct table access.
BEGIN;
CREATE ROLE sf_registration_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA sf_core TO sf_registration_issuer;
CREATE FUNCTION sf_core.issue_registration_admission(p_subject uuid,p_email text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 -- Only the trusted server-side NEW signup callback may invoke this function.
 -- The recent creation check is supplementary, not proof of a new signup event.
 IF p_subject IS NULL OR p_email IS NULL OR char_length(p_email)>254 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."user" u WHERE u.id=p_subject AND u.email=p_email
  AND u."emailVerified" IS FALSE AND u."createdAt">=t-interval '2 minutes' AND u."createdAt"<=t
  AND u.username ~ '^[a-z0-9_]{3,24}$'
  AND COALESCE(u."twoFactorEnabled",false)=false)
 OR NOT EXISTS(SELECT 1 FROM public.account a WHERE a."userId"=p_subject AND a."providerId"='credential' AND a.password IS NOT NULL)
 OR EXISTS(SELECT 1 FROM sf_core.auth_bindings b WHERE b.auth_subject=p_subject) THEN RETURN false; END IF;
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at)
 VALUES(p_subject,t,t+interval '15 minutes') ON CONFLICT(auth_subject) DO NOTHING;
 RETURN FOUND;
END $$;
CREATE FUNCTION sf_core.registration_mail_allowed(p_subject uuid,p_email text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM sf_core.fresh_registration_admissions a JOIN public."user" u ON u.id=a.auth_subject
 WHERE a.auth_subject=p_subject AND u.email=p_email AND u."emailVerified" IS FALSE
 AND a.consumed_at IS NULL AND a.issued_at<=statement_timestamp() AND a.expires_at>statement_timestamp()
 AND NOT EXISTS(SELECT 1 FROM sf_core.auth_bindings b WHERE b.auth_subject=p_subject))
$$;
REVOKE ALL ON FUNCTION sf_core.issue_registration_admission(uuid,text),sf_core.registration_mail_allowed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.issue_registration_admission(uuid,text),sf_core.registration_mail_allowed(uuid,text) TO sf_registration_issuer;
COMMIT;
