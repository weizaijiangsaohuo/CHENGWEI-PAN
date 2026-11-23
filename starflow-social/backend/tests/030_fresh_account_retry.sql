-- Disposable staging/CI fixture; never commit test accounts.
BEGIN;
DO $$
DECLARE s uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid();
 legacy_session uuid:=gen_random_uuid(); p uuid; old_p uuid; t timestamptz:=clock_timestamp();
BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified",username,"updatedAt")
 VALUES(s,'Retry fixture','retry030@example.invalid',true,'retry030',t),
 (legacy,'Legacy fixture','legacy030@example.invalid',true,'legacy030',t);
 INSERT INTO public."session"(id,"userId",token,"expiresAt","updatedAt")
 VALUES(session_id,s,'synthetic030-session',t+interval '1 hour',t),
 (legacy_session,legacy,'synthetic030-legacy',t+interval '1 hour',t);
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at)
 VALUES(s,t-interval '1 minute',t+interval '10 minutes');
 INSERT INTO sf_core.principals DEFAULT VALUES RETURNING id INTO old_p;
 INSERT INTO sf_core.profiles(id,handle) VALUES(old_p,'legacy030');
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(old_p,legacy);
 IF sf_core.provision_fresh_account(legacy,legacy_session) IS NOT NULL THEN RAISE EXCEPTION 'legacy admitted'; END IF;
 p:=sf_core.provision_fresh_account(s,session_id);
 IF p IS NULL THEN RAISE EXCEPTION 'initialization failed'; END IF;
 IF sf_core.provision_fresh_account(s,session_id) IS DISTINCT FROM p THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
 IF sf_core.provision_fresh_account(s,legacy_session) IS NOT NULL THEN RAISE EXCEPTION 'foreign session accepted'; END IF;
 UPDATE sf_core.fresh_registration_admissions SET issued_at=t-interval '10 minutes',consumed_at=t-interval '8 minutes',expires_at=t-interval '5 minutes' WHERE auth_subject=s;
 IF sf_core.provision_fresh_account(s,session_id) IS DISTINCT FROM p THEN RAISE EXCEPTION 'completed admission not retryable'; END IF;
 UPDATE public."session" SET "expiresAt"=t-interval '1 second' WHERE id=session_id;
 IF sf_core.provision_fresh_account(s,session_id) IS NOT NULL THEN RAISE EXCEPTION 'expired session accepted'; END IF;
 IF (SELECT count(*) FROM sf_core.auth_bindings WHERE auth_subject=s)<>1 OR EXISTS(SELECT 1 FROM sf_core.staff_roles WHERE principal_id=p) THEN RAISE EXCEPTION 'duplicate or privileged principal'; END IF;
 IF has_function_privilege('sf_auth_runtime','sf_core.provision_fresh_account(uuid,uuid)','EXECUTE') OR has_function_privilege('sf_business_connect','sf_core.provision_fresh_account(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'permission leak'; END IF;
END $$;
ROLLBACK;
