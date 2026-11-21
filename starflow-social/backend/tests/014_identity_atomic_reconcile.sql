\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$ DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 i uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 w uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
BEGIN
 INSERT INTO sf_core.identity_attempts(id,principal_id,provider_session_id,workflow_id,workflow_version,state)
 VALUES(i,a,s,w,1,'pending'),(j,b,t,w,1,'pending');
 IF sf_core.apply_identity_decision(e,i,t,w,1,0,'checks_passed')<>'rejected' THEN RAISE EXCEPTION 'wrong session accepted'; END IF;
 IF sf_core.apply_identity_decision(e,i,s,w,2,0,'checks_passed')<>'rejected' THEN RAISE EXCEPTION 'wrong workflow version accepted'; END IF;
 IF sf_core.apply_identity_decision(e,i,s,w,1,0,'review')<>'applied' THEN RAISE EXCEPTION 'initial reconciliation failed'; END IF;
 IF sf_core.apply_identity_decision(e,i,s,w,1,0,'checks_passed')<>'duplicate' THEN RAISE EXCEPTION 'duplicate not detected'; END IF;
 IF sf_core.apply_identity_decision(e,j,t,w,1,0,'checks_passed')<>'rejected' THEN RAISE EXCEPTION 'cross-account event reuse'; END IF;
 IF sf_core.apply_identity_decision(f,i,s,w,1,0,'checks_passed')<>'stale' THEN RAISE EXCEPTION 'stale revision accepted'; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.identity_events WHERE event_id=f) THEN RAISE EXCEPTION 'stale event consumed'; END IF;
 IF sf_core.apply_identity_decision(f,i,s,w,1,1,'checks_passed')<>'applied' THEN RAISE EXCEPTION 'fresh decision failed'; END IF;
 IF sf_core.apply_identity_decision(g,i,s,w,1,2,'pending')<>'stale' THEN RAISE EXCEPTION 'terminal regression accepted'; END IF;
 IF (SELECT count(*) FROM sf_core.identity_events WHERE attempt_id=i)<>2 THEN RAISE EXCEPTION 'event count mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.identity_attempts WHERE id=i AND revision=2 AND state='checks_passed') THEN RAISE EXCEPTION 'state mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.identity_attempts WHERE id=j AND revision=0 AND state='pending') THEN RAISE EXCEPTION 'other principal mutated'; END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN
  PERFORM sf_core.apply_identity_decision(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,0,'checks_passed');
  RAISE EXCEPTION 'unprivileged identity mutation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
