-- Disposable local PostgreSQL only. Fixture data are synthetic.
\set ON_ERROR_STOP on
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO sf_core.profiles(id,handle) VALUES ('11111111-1111-4111-8111-111111111111','test_a'),('22222222-2222-4222-8222-222222222222','test_b');
INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
BEGIN;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 IF (SELECT count(*) FROM sf_core.profiles) <> 0 THEN RAISE EXCEPTION 'missing context exposed profiles'; END IF;
END $$;
SELECT set_config('sf.principal_id','invalid',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sf_core.profiles) <> 0 THEN RAISE EXCEPTION 'invalid context exposed profiles'; END IF;
END $$;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE affected int; BEGIN
 IF (SELECT count(*) FROM sf_core.profiles) <> 1 THEN RAISE EXCEPTION 'RLS profile isolation failed'; END IF;
 UPDATE sf_core.profiles SET bio='self' WHERE id='11111111-1111-4111-8111-111111111111';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected <> 1 THEN RAISE EXCEPTION 'own update failed'; END IF;
 UPDATE sf_core.profiles SET bio='other' WHERE id='22222222-2222-4222-8222-222222222222';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected <> 0 THEN RAISE EXCEPTION 'cross-account update allowed'; END IF;
 BEGIN
  UPDATE sf_core.profiles SET handle='admin' WHERE id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'handle update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM sf_core.auth_bindings;
  RAISE EXCEPTION 'binding exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO sf_core.principals DEFAULT VALUES;
  RAISE EXCEPTION 'principal creation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
-- pooled connection must not retain actor context after transaction
SET ROLE sf_profile_runtime;
DO $$ BEGIN
 IF (SELECT count(*) FROM sf_core.profiles) <> 0 THEN RAISE EXCEPTION 'context leaked'; END IF;
END $$;
RESET ROLE;
DELETE FROM sf_core.principals WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
