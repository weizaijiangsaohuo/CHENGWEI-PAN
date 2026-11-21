\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO sf_core.follows(follower_id,target_id,accepted) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',true),('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',true);
SET LOCAL ROLE sf_profile_runtime;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','first'),(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','second');
DO $$ DECLARE cursor_id bigint; BEGIN
 SELECT sync_seq INTO cursor_id FROM sf_core.read_dm_delta(0,1);
 IF cursor_id IS NULL OR (SELECT body FROM sf_core.read_dm_delta(cursor_id,1)) IS DISTINCT FROM 'second' THEN RAISE EXCEPTION 'cursor failure'; END IF;
 BEGIN
 INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body,sync_seq) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','forged',999999);
 RAISE EXCEPTION 'forged cursor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('sf.principal_id','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.read_dm_delta(0,100)) THEN RAISE EXCEPTION 'outsider sync leak'; END IF; END $$;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN IF (SELECT count(*) FROM sf_core.read_dm_delta(0,100))<>2 THEN RAISE EXCEPTION 'recipient sync missing'; END IF; END $$;
INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES(sf_core.request_principal(),'11111111-1111-4111-8111-111111111111');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.read_dm_delta(0,100)) THEN RAISE EXCEPTION 'blocked sync leak'; END IF; END $$;
ROLLBACK;
