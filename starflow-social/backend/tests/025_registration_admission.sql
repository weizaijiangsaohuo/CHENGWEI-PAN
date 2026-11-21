-- Disposable CI, synthetic accounts only; everything rolled back.
BEGIN;
INSERT INTO public."user"(id,name,email,"emailVerified",username,"createdAt","updatedAt") VALUES
 ('00000000-0000-4000-8000-000000002501','Fixture','fresh025@example.invalid',false,'fresh025',clock_timestamp(),now()),
 ('00000000-0000-4000-8000-000000002502','Fixture','old025@example.invalid',false,'old025',now()-interval '1 hour',now()),
 ('00000000-0000-4000-8000-000000002503','Fixture','verified025@example.invalid',true,'verified025',clock_timestamp(),now()),
 ('00000000-0000-4000-8000-000000002504','Fixture','nocred025@example.invalid',false,'nocred025',clock_timestamp(),now());
INSERT INTO public.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt")
 SELECT gen_random_uuid(),id::text,'credential',id,'synthetic-not-a-real-password-hash',now(),now() FROM public."user" WHERE id IN ('00000000-0000-4000-8000-000000002501','00000000-0000-4000-8000-000000002502','00000000-0000-4000-8000-000000002503');
DO $$
BEGIN
 IF has_function_privilege('sf_auth_runtime','sf_core.issue_registration_admission(uuid,text)','EXECUTE')
 OR has_function_privilege('sf_business_connect','sf_core.issue_registration_admission(uuid,text)','EXECUTE')
 OR has_function_privilege('sf_fresh_account_gateway','sf_core.issue_registration_admission(uuid,text)','EXECUTE')
 OR has_function_privilege('sf_registration_issuer','sf_core.provision_fresh_account(uuid,uuid)','EXECUTE')
 OR has_table_privilege('sf_registration_issuer','public."user"','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('sf_registration_issuer','sf_core.staff_roles','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('sf_registration_issuer','sf_core.fresh_registration_admissions','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'issuer privilege leakage'; END IF;
END $$;
SET LOCAL ROLE sf_registration_issuer;
DO $$
DECLARE sid uuid:='00000000-0000-4000-8000-000000002501';
BEGIN
 IF sf_core.registration_mail_allowed(sid,'fresh025@example.invalid') THEN RAISE EXCEPTION 'mail before admission'; END IF;
 IF sf_core.issue_registration_admission(sid,'wrong@example.invalid')
 OR sf_core.issue_registration_admission('00000000-0000-4000-8000-000000002502','old025@example.invalid')
 OR sf_core.issue_registration_admission('00000000-0000-4000-8000-000000002503','verified025@example.invalid')
 OR sf_core.issue_registration_admission('00000000-0000-4000-8000-000000002504','nocred025@example.invalid')
 THEN RAISE EXCEPTION 'ineligible signup'; END IF;
 IF NOT sf_core.issue_registration_admission(sid,'fresh025@example.invalid')
 THEN RAISE EXCEPTION 'admission issuance failed'; END IF;
END $$;
-- The SQL STABLE mail gate uses statement_timestamp(). Issue and check must
-- be separate top-level statements, just like the runtime's separate transactions.
DO $$
DECLARE sid uuid:='00000000-0000-4000-8000-000000002501';
BEGIN
 IF NOT sf_core.registration_mail_allowed(sid,'fresh025@example.invalid')
 THEN RAISE EXCEPTION 'admission recipient denied'; END IF;
 IF sf_core.registration_mail_allowed(sid,'wrong@example.invalid')
 THEN RAISE EXCEPTION 'wrong recipient allowed'; END IF;
 IF sf_core.issue_registration_admission(sid,'fresh025@example.invalid')
 THEN RAISE EXCEPTION 'duplicate admission issued'; END IF;
END $$;
RESET ROLE;
UPDATE public."user" SET "emailVerified"=true WHERE id='00000000-0000-4000-8000-000000002501';
SET LOCAL ROLE sf_registration_issuer;
DO $$ BEGIN
 IF sf_core.registration_mail_allowed('00000000-0000-4000-8000-000000002501','fresh025@example.invalid') THEN RAISE EXCEPTION 'verified recipient still eligible'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
