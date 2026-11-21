-- Disposable CI only. All synthetic fixtures are rolled back.
BEGIN;
INSERT INTO public."user"(id,name,email,"emailVerified",username,"updatedAt") VALUES
 ('00000000-0000-4000-8000-000000002401','Fixture','fresh024@example.invalid',true,'fresh024',now()),
 ('00000000-0000-4000-8000-000000002402','Fixture','unverified024@example.invalid',false,'unverified024',now()),
 ('00000000-0000-4000-8000-000000002403','Fixture','collision024@example.invalid',true,'collision024',now()),
 ('00000000-0000-4000-8000-000000002404','Fixture','legacy024@example.invalid',true,'legacy024',now());
INSERT INTO public."session"(id,"userId",token,"expiresAt","updatedAt")
 SELECT ('00000000-0000-4000-8000-00000000241'||n)::uuid,('00000000-0000-4000-8000-00000000240'||n)::uuid,'synthetic024-'||n,now()+interval '1 hour',now() FROM generate_series(1,4)n;
INSERT INTO sf_core.fresh_registration_admissions(auth_subject,expires_at)
 SELECT ('00000000-0000-4000-8000-00000000240'||n)::uuid,clock_timestamp()+interval '10 minutes' FROM generate_series(1,3)n;
INSERT INTO sf_core.principals(id) VALUES('00000000-0000-4000-8000-000000002499');
INSERT INTO sf_core.profiles(id,handle) VALUES('00000000-0000-4000-8000-000000002499','collision024');
DO $$
BEGIN
 IF has_function_privilege('sf_auth_runtime','sf_core.provision_fresh_account(uuid,uuid)','EXECUTE')
 OR has_function_privilege('sf_business_connect','sf_core.provision_fresh_account(uuid,uuid)','EXECUTE')
 OR has_table_privilege('sf_fresh_account_gateway','sf_core.fresh_registration_admissions','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('sf_fresh_account_gateway','public."user"','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('sf_fresh_account_gateway','sf_core.staff_roles','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'provision privilege leakage'; END IF;
END $$;
SET LOCAL ROLE sf_fresh_account_gateway;
DO $$
DECLARE new_id uuid;
BEGIN
 IF sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002412') IS NOT NULL THEN RAISE EXCEPTION 'foreign session'; END IF;
 IF sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002402','00000000-0000-4000-8000-000000002412') IS NOT NULL THEN RAISE EXCEPTION 'unverified account'; END IF;
 IF sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002403','00000000-0000-4000-8000-000000002413') IS NOT NULL THEN RAISE EXCEPTION 'legacy handle claim'; END IF;
 IF sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002404','00000000-0000-4000-8000-000000002414') IS NOT NULL THEN RAISE EXCEPTION 'missing admission'; END IF;
 new_id:=sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002411');
 IF new_id IS NULL OR new_id='00000000-0000-4000-8000-000000002401' THEN RAISE EXCEPTION 'fresh principal missing'; END IF;
 IF sf_core.provision_fresh_account('00000000-0000-4000-8000-000000002401','00000000-0000-4000-8000-000000002411') IS NOT NULL THEN RAISE EXCEPTION 'replay'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE p uuid;
BEGIN
 SELECT principal_id INTO p FROM sf_core.auth_bindings WHERE auth_subject='00000000-0000-4000-8000-000000002401';
 IF p IS NULL OR NOT EXISTS(SELECT 1 FROM sf_core.profiles WHERE id=p AND handle='fresh024' AND bio='' AND avatar_url IS NULL)
 OR EXISTS(SELECT 1 FROM sf_core.staff_roles WHERE principal_id=p)
 OR EXISTS(SELECT 1 FROM sf_core.identity_evidence_reviewers WHERE principal_id=p)
 OR EXISTS(SELECT 1 FROM sf_core.account_recovery_policy WHERE principal_id=p)
 THEN RAISE EXCEPTION 'new account is not fresh'; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.fresh_registration_admissions WHERE auth_subject='00000000-0000-4000-8000-000000002403' AND consumed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'collision consumed admission'; END IF;
 RAISE NOTICE 'PASS: fresh account isolation';
END $$;
ROLLBACK;
