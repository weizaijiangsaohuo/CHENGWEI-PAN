\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); mail text:='fresh-recovery-fixture@example.invalid'; t timestamptz:=clock_timestamp(); BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES(s,'Fixture',mail,true,t,t,false);
 INSERT INTO sf_core.principals(id) VALUES(p);
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(p,s);
 INSERT INTO sf_core.account_recovery_policy(principal_id,enabled) VALUES(p,true);
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'legacy binding allowed'; END IF;
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at) VALUES(s,t-interval '1 minute',t+interval '14 minutes');
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'unconsumed admission allowed'; END IF;
 UPDATE sf_core.fresh_registration_admissions SET consumed_at=t WHERE auth_subject=s;
 IF NOT sf_core.ordinary_recovery_allowed(s,mail) OR NOT sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'fresh preflight rejected'; END IF;
 IF sf_core.ordinary_recovery_allowed(s,'wrong@example.invalid') THEN RAISE EXCEPTION 'recipient mismatch'; END IF;
 UPDATE sf_core.account_recovery_policy SET enabled=false WHERE principal_id=p;
 IF sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'withdrawn policy allowed'; END IF;
 UPDATE sf_core.account_recovery_policy SET enabled=true WHERE principal_id=p;
 UPDATE public."user" SET "twoFactorEnabled"=true WHERE id=s;
 IF sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'MFA bypass'; END IF;
 UPDATE public."user" SET "twoFactorEnabled"=false WHERE id=s;
 INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES(p,'moderator',false);
 IF sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'staff bypass'; END IF;
END $$;
SET LOCAL ROLE sf_account_recovery_gateway;
DO $$ BEGIN
 IF sf_core.ordinary_recovery_allowed(gen_random_uuid(),NULL) THEN RAISE EXCEPTION 'unknown allowed'; END IF;
 BEGIN PERFORM * FROM sf_core.fresh_registration_admissions; RAISE EXCEPTION 'admission exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.ordinary_recovery_allowed(gen_random_uuid(),NULL); RAISE EXCEPTION 'ordinary role allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
