\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); mail text:='recovery-policy-fixture@example.invalid'; BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES(s,'Fixture',mail,true,now(),now(),false);
 INSERT INTO sf_core.principals(id) VALUES(a);
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'unbound account'; END IF;
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(a,s);
 INSERT INTO sf_core.account_recovery_policy(principal_id) VALUES(a);
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'default allow'; END IF;
 UPDATE sf_core.account_recovery_policy SET enabled=true WHERE principal_id=a;
 IF NOT sf_core.ordinary_recovery_allowed(s,mail) OR NOT sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'eligible rejected'; END IF;
 IF sf_core.ordinary_recovery_allowed(s,'wrong@example.invalid') OR sf_core.ordinary_recovery_allowed(n,NULL) THEN RAISE EXCEPTION 'wrong binding'; END IF;
 UPDATE public."user" SET "twoFactorEnabled"=true WHERE id=s;
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'MFA bypass'; END IF;
 UPDATE public."user" SET "twoFactorEnabled"=false,"emailVerified"=false WHERE id=s;
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'unverified bypass'; END IF;
 UPDATE public."user" SET "emailVerified"=true WHERE id=s;
 INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES(a,'moderator',false);
 IF sf_core.ordinary_recovery_allowed(s,mail) THEN RAISE EXCEPTION 'disabled staff bypass'; END IF;
 UPDATE sf_core.staff_roles SET enabled=true WHERE principal_id=a;
 IF sf_core.ordinary_recovery_allowed(s,NULL) THEN RAISE EXCEPTION 'staff bypass'; END IF;
END $$;
SET LOCAL ROLE sf_account_recovery_gateway;
DO $$ BEGIN
 IF sf_core.ordinary_recovery_allowed(gen_random_uuid(),NULL) THEN RAISE EXCEPTION 'unknown subject'; END IF;
 BEGIN PERFORM * FROM public."user";RAISE EXCEPTION 'auth data exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM sf_core.account_recovery_policy;RAISE EXCEPTION 'policy exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM sf_core.identity_evidence;RAISE EXCEPTION 'identity data exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.ordinary_recovery_allowed(gen_random_uuid(),NULL);RAISE EXCEPTION 'ordinary access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
