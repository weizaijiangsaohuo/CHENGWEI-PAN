\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$ DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 i uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); got bytea;
BEGIN
 INSERT INTO sf_core.staff_roles VALUES(a,'founder',true);
 INSERT INTO sf_core.identity_evidence_reviewers VALUES(a,true);
 INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES(i,b,gen_random_uuid(),1);
 UPDATE sf_core.identity_attempts SET state='cancelled' WHERE id=i;
 INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES(j,b,gen_random_uuid(),1);
 INSERT INTO sf_core.identity_evidence_consent(attempt_id,policy_version,expires_at) VALUES(i,'fixture',clock_timestamp()+interval '1 hour'),(j,'fixture',clock_timestamp()+interval '1 hour');
 INSERT INTO sf_core.identity_evidence VALUES
 (i,'face_photo','fixture',decode(repeat('00',12),'hex'),decode(repeat('11',17),'hex'),clock_timestamp()),
 (i,'document_front','fixture',decode(repeat('01',12),'hex'),decode(repeat('22',17),'hex'),clock_timestamp()),
 (j,'face_photo','fixture',decode(repeat('02',12),'hex'),decode(repeat('33',17),'hex'),clock_timestamp());
 INSERT INTO sf_core.identity_evidence_proofs(id,principal_id,session_id,attempt_id,method,expires_at,purpose,evidence_kind)
 VALUES(p,a,s,i,'totp',clock_timestamp()+interval '4 minutes','material','face_photo'),
 (q,a,s,i,'totp',clock_timestamp()+interval '4 minutes','material','face_photo'),
 (m,a,s,i,'totp',clock_timestamp()+interval '4 minutes','metadata',NULL);
 BEGIN PERFORM sf_core.read_identity_evidence(a,s,m,i,'face_photo'); RAISE EXCEPTION 'metadata proof allowed material'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.identity_case_metadata(a,s,p,i); RAISE EXCEPTION 'material proof allowed metadata'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.read_identity_evidence(a,s,p,i,'document_front'); RAISE EXCEPTION 'wrong category accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.read_identity_evidence(a,s,p,j,'face_photo'); RAISE EXCEPTION 'wrong case accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT ciphertext INTO got FROM sf_core.read_identity_evidence(a,s,p,i,'face_photo');
 IF got IS DISTINCT FROM decode(repeat('11',17),'hex') THEN RAISE EXCEPTION 'wrong encrypted item'; END IF;
 BEGIN PERFORM sf_core.read_identity_evidence(a,s,p,i,'face_photo'); RAISE EXCEPTION 'replay accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF sf_core.withdraw_identity_evidence(a,i) THEN RAISE EXCEPTION 'another user withdrew consent'; END IF;
 IF NOT sf_core.withdraw_identity_evidence(b,i) THEN RAISE EXCEPTION 'own withdrawal failed'; END IF;
 BEGIN PERFORM sf_core.read_identity_evidence(a,s,q,i,'face_photo'); RAISE EXCEPTION 'withdrawn material exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO sf_core.identity_evidence VALUES(i,'document_back','fixture',decode(repeat('03',12),'hex'),decode(repeat('44',17),'hex'),clock_timestamp()); RAISE EXCEPTION 'revoked capture allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF sf_core.purge_identity_evidence(1)<>2 THEN RAISE EXCEPTION 'incorrect purge count'; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.identity_evidence WHERE attempt_id=i) OR NOT EXISTS(SELECT 1 FROM sf_core.identity_evidence WHERE attempt_id=j) THEN RAISE EXCEPTION 'purge scope'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.identity_attempts WHERE id=i) OR NOT EXISTS(SELECT 1 FROM sf_core.identity_evidence_consent WHERE attempt_id=i) OR NOT EXISTS(SELECT 1 FROM sf_core.staff_audit WHERE actor_id=a AND target_id=i AND action='identity_evidence_read_face_photo') THEN RAISE EXCEPTION 'history missing'; END IF;
 IF sf_core.purge_identity_evidence(50)<>0 THEN RAISE EXCEPTION 'active evidence purged'; END IF;
 -- Advance the synthetic consent window into the past without changing evidence.
 UPDATE sf_core.identity_evidence_consent SET granted_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE attempt_id=j;
 IF sf_core.purge_identity_evidence(1)<>1 THEN RAISE EXCEPTION 'expired evidence retained'; END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.purge_identity_evidence(1); RAISE EXCEPTION 'unauthorized purge'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.read_identity_evidence(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'face_photo'); RAISE EXCEPTION 'unauthorized read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
