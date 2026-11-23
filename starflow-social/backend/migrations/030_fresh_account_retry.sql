-- Staging: permit an authenticated retry after a committed initialization whose response was lost.
-- Never create another principal or adopt a legacy handle or binding.
BEGIN;
CREATE OR REPLACE FUNCTION sf_core.provision_fresh_account(p_subject uuid,p_session uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h text; new_id uuid; t timestamptz; admission sf_core.fresh_registration_admissions%ROWTYPE;
BEGIN
 -- Subject must be admitted by a trusted new-signup ceremony, not a legacy import.
 SELECT * INTO admission FROM sf_core.fresh_registration_admissions
 WHERE auth_subject=p_subject FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT u.username INTO h FROM public."user" u
 WHERE u.id=p_subject AND u."emailVerified" IS TRUE FOR UPDATE;
 IF NOT FOUND OR h IS NULL OR h !~ '^[a-z0-9_]{3,24}$' THEN RETURN NULL; END IF;
 PERFORM 1 FROM public."session" s WHERE s.id=p_session AND s."userId"=p_subject AND s."expiresAt">clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- A consumed admission records a successful fresh-account initialization.
 -- A retry can only return the existing binding of this exact authenticated subject.
 IF admission.consumed_at IS NOT NULL THEN
  IF admission.consumed_at<admission.issued_at OR admission.consumed_at>=admission.expires_at THEN RETURN NULL; END IF;
  SELECT b.principal_id INTO new_id FROM sf_core.auth_bindings b
   JOIN sf_core.profiles pr ON pr.id=b.principal_id
   WHERE b.auth_subject=p_subject;
  RETURN new_id;
 END IF;
 IF EXISTS(SELECT 1 FROM sf_core.auth_bindings WHERE auth_subject=p_subject) THEN RETURN NULL; END IF;
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
