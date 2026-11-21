\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111');
DO $$ DECLARE a uuid:='11111111-1111-4111-8111-111111111111';i uuid:=gen_random_uuid();s uuid:=gen_random_uuid();w uuid:=gen_random_uuid();e uuid:=gen_random_uuid(); BEGIN
 BEGIN
  INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version,environment) VALUES(gen_random_uuid(),a,w,1,'live');
  RAISE EXCEPTION 'live activation permitted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version,provider_session_id,state) VALUES(i,a,w,1,s,'pending');
 BEGIN
  INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES(gen_random_uuid(),a,w,1);
  RAISE EXCEPTION 'duplicate open attempt';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF sf_core.record_identity_event(e,i,gen_random_uuid(),w,1) THEN RAISE EXCEPTION 'wrong session accepted'; END IF;
 IF sf_core.record_identity_event(e,i,s,w,2) THEN RAISE EXCEPTION 'wrong version accepted'; END IF;
 IF NOT sf_core.record_identity_event(e,i,s,w,1) THEN RAISE EXCEPTION 'first event refused'; END IF;
 IF sf_core.record_identity_event(e,i,s,w,1) THEN RAISE EXCEPTION 'replay accepted'; END IF;
 IF NOT sf_core.reconcile_identity(i,s,0,'review') THEN RAISE EXCEPTION 'review failed'; END IF;
 IF sf_core.reconcile_identity(i,s,0,'checks_passed') THEN RAISE EXCEPTION 'stale revision accepted'; END IF;
 IF NOT sf_core.reconcile_identity(i,s,1,'checks_passed') THEN RAISE EXCEPTION 'reconcile failed'; END IF;
 IF sf_core.reconcile_identity(i,s,2,'pending') THEN RAISE EXCEPTION 'terminal regression accepted'; END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.identity_attempts; RAISE EXCEPTION 'identity data exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sf_core.reconcile_identity(gen_random_uuid(),gen_random_uuid(),0,'checks_passed'); RAISE EXCEPTION 'unprivileged identity mutation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
