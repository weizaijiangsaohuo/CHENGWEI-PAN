\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111');
DO $$ DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; i uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); app uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); n bigint;
BEGIN
 INSERT INTO sf_core.identity_attempts(id,principal_id,provider_session_id,workflow_id,workflow_version,state) VALUES(i,a,s,w,1,'pending');
 INSERT INTO sf_core.didit_sandbox_workflows(workflow_id,workflow_version,application_id,document_node,liveness_node,face_node) VALUES(w,1,app,'doc','live','face');
 IF EXISTS(SELECT 1 FROM sf_core.resolve_didit_attempt(app,w,1,i,s)) THEN RAISE EXCEPTION 'disabled workflow resolved';END IF;
 IF sf_core.apply_didit_verified_result(app,e,i,s,w,1,0,'checks_passed')<>'rejected' THEN RAISE EXCEPTION 'disabled workflow applied';END IF;
 UPDATE sf_core.didit_sandbox_workflows SET enabled=true WHERE workflow_id=w;
 IF EXISTS(SELECT 1 FROM sf_core.resolve_didit_attempt(gen_random_uuid(),w,1,i,s)) THEN RAISE EXCEPTION 'wrong application';END IF;
 SELECT revision INTO STRICT n FROM sf_core.resolve_didit_attempt(app,w,1,i,s);
 IF n<>0 THEN RAISE EXCEPTION 'unexpected revision';END IF;
 IF sf_core.apply_didit_verified_result(app,e,i,gen_random_uuid(),w,1,0,'checks_passed')<>'rejected' THEN RAISE EXCEPTION 'wrong session';END IF;
 IF sf_core.apply_didit_verified_result(app,e,i,s,w,1,0,'checks_passed')<>'applied' THEN RAISE EXCEPTION 'result not applied';END IF;
 IF sf_core.apply_didit_verified_result(app,e,i,s,w,1,0,'checks_passed')<>'duplicate' THEN RAISE EXCEPTION 'replay not deduped';END IF;
END $$;
SET LOCAL ROLE sf_didit_reconcile_gateway;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.identity_attempts;RAISE EXCEPTION 'direct attempt access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM sf_core.didit_sandbox_workflows;RAISE EXCEPTION 'direct workflow access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM sf_core.identity_evidence;RAISE EXCEPTION 'raw evidence access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM sf_core.apply_identity_decision(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,0,'checks_passed');RAISE EXCEPTION 'direct write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.resolve_didit_attempt(gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid(),gen_random_uuid());RAISE EXCEPTION 'ordinary access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
