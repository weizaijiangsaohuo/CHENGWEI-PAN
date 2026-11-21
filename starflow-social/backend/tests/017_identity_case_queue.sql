\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
DO $$ DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222'; c uuid:='33333333-3333-4333-8333-333333333333';
 subject uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); got text[];
BEGIN
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(a,subject);
 INSERT INTO sf_core.staff_roles VALUES(a,'founder',true);
 INSERT INTO sf_core.identity_evidence_reviewers VALUES(a,true);
 INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES(i,b,gen_random_uuid(),1),(j,c,gen_random_uuid(),1);
 INSERT INTO sf_core.identity_evidence_consent(attempt_id,policy_version,expires_at) VALUES(i,'fixture',clock_timestamp()+interval '1 hour');
 INSERT INTO sf_core.identity_evidence VALUES(i,'face_photo','fixture',decode(repeat('00',12),'hex'),decode(repeat('11',17),'hex'),clock_timestamp());
 INSERT INTO sf_core.identity_queue_proofs(id,principal_id,session_id,subject_filter,expires_at,method)
 VALUES(p,a,sid,b,clock_timestamp()+interval '4 minutes','totp'),(q,a,sid,b,clock_timestamp()+interval '4 minutes','totp');
 BEGIN PERFORM sf_core.list_identity_cases(subject,sid,p,NULL,NULL); RAISE EXCEPTION 'unbound filter accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.list_identity_cases(subject,gen_random_uuid(),p,b,NULL); RAISE EXCEPTION 'wrong session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT evidence_kinds INTO STRICT got FROM sf_core.list_identity_cases(subject,sid,p,b,NULL);
 IF got IS DISTINCT FROM ARRAY['face_photo']::text[] THEN RAISE EXCEPTION 'metadata wrong'; END IF;
 BEGIN PERFORM sf_core.list_identity_cases(subject,sid,p,b,NULL); RAISE EXCEPTION 'replay accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM sf_core.withdraw_identity_evidence(b,i);
 SELECT evidence_kinds INTO STRICT got FROM sf_core.list_identity_cases(subject,sid,q,b,NULL);
 IF got IS DISTINCT FROM ARRAY[]::text[] THEN RAISE EXCEPTION 'withdrawn material listed'; END IF;
 IF (SELECT count(*) FROM sf_core.staff_audit WHERE actor_id=a AND action='identity_case_list')<>2 THEN RAISE EXCEPTION 'audit mismatch'; END IF;
END $$;
SET LOCAL ROLE sf_identity_queue_gateway;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.identity_evidence; RAISE EXCEPTION 'direct ciphertext access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM sf_core.identity_queue_proofs; RAISE EXCEPTION 'proof access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.list_identity_cases(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,NULL); RAISE EXCEPTION 'unknown subject accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.list_identity_cases(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,NULL); RAISE EXCEPTION 'ordinary user listing permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
