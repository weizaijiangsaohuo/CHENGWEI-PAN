\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$ DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 i uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); got text[];
BEGIN
 INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES(a,'founder',true);
 INSERT INTO sf_core.identity_evidence_reviewers VALUES(a,true);
 INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES(i,b,gen_random_uuid(),1);
 INSERT INTO sf_core.identity_evidence_consent(attempt_id,policy_version,expires_at) VALUES(i,'fixture',clock_timestamp()+interval '1 day');
 INSERT INTO sf_core.identity_evidence VALUES(i,'face_photo','fixture',decode(repeat('00',12),'hex'),decode(repeat('11',17),'hex'),clock_timestamp());
 INSERT INTO sf_core.identity_evidence_proofs(id,principal_id,session_id,attempt_id,method,expires_at) VALUES(p,a,s,i,'totp',clock_timestamp()+interval '4 minutes'),(q,a,s,i,'totp',clock_timestamp()+interval '4 minutes');
 BEGIN PERFORM sf_core.identity_case_metadata(a,gen_random_uuid(),p,i);RAISE EXCEPTION 'wrong session accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM sf_core.identity_case_metadata(b,s,p,i);RAISE EXCEPTION 'wrong actor accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM sf_core.identity_case_metadata(a,s,p,gen_random_uuid());RAISE EXCEPTION 'wrong case accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM sf_core.identity_evidence_proofs WHERE id=p AND consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'denied request consumed proof';END IF;
 SELECT evidence_kinds INTO got FROM sf_core.identity_case_metadata(a,s,p,i);
 IF got IS DISTINCT FROM ARRAY['face_photo']::text[] THEN RAISE EXCEPTION 'metadata missing';END IF;
 BEGIN PERFORM sf_core.identity_case_metadata(a,s,p,i);RAISE EXCEPTION 'replayed proof';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE sf_core.identity_evidence_consent SET revoked_at=clock_timestamp() WHERE attempt_id=i;
 SELECT evidence_kinds INTO got FROM sf_core.identity_case_metadata(a,s,q,i);
 IF got IS DISTINCT FROM ARRAY[]::text[] THEN RAISE EXCEPTION 'withdrawn evidence exposed';END IF;
 IF (SELECT count(*) FROM sf_core.staff_audit WHERE actor_id=a AND action='identity_case_metadata')<>2 THEN RAISE EXCEPTION 'audit missing';END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.identity_evidence;RAISE EXCEPTION 'vault exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM sf_core.identity_case_metadata(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());RAISE EXCEPTION 'unauthorized read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
