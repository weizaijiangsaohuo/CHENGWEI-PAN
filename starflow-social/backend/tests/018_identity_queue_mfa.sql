\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$ DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 subject uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); p uuid; f bytea:=decode(repeat('aa',32),'hex');
BEGIN
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(a,subject);
 INSERT INTO sf_core.staff_roles VALUES(a,'founder',true);
 INSERT INTO sf_core.identity_evidence_reviewers VALUES(a,true);
 IF sf_core.issue_identity_queue_proof(gen_random_uuid(),sid,b,NULL,f) IS NOT NULL THEN RAISE EXCEPTION 'unknown subject'; END IF;
 p:=sf_core.issue_identity_queue_proof(subject,sid,b,NULL,f);
 IF p IS NULL THEN RAISE EXCEPTION 'no proof'; END IF;
 IF sf_core.issue_identity_queue_proof(subject,gen_random_uuid(),NULL,NULL,f) IS NOT NULL THEN RAISE EXCEPTION 'cross-session replay'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.identity_queue_proofs WHERE id=p AND principal_id=a AND session_id=sid AND subject_filter=b AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'wrong binding'; END IF;
 PERFORM sf_core.list_identity_cases(subject,sid,p,b,NULL);
 UPDATE sf_core.identity_evidence_reviewers SET enabled=false WHERE principal_id=a;
 IF sf_core.issue_identity_queue_proof(subject,sid,b,NULL,decode(repeat('bb',32),'hex')) IS NOT NULL THEN RAISE EXCEPTION 'disabled reviewer'; END IF;
END $$;
SET LOCAL ROLE sf_identity_queue_gateway;
DO $$ BEGIN
 BEGIN PERFORM sf_core.issue_identity_queue_proof(gen_random_uuid(),gen_random_uuid(),NULL,NULL,decode(repeat('aa',32),'hex'));RAISE EXCEPTION 'queue minted proof';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_identity_proof_issuer;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.identity_evidence;RAISE EXCEPTION 'issuer raw access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM sf_core.list_identity_cases(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,NULL);RAISE EXCEPTION 'issuer list access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
