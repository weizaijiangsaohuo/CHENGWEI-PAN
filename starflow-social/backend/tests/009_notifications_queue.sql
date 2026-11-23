\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO sf_core.follows(follower_id,target_id,accepted) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',true),('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES('33333333-3333-4333-8333-333333333333','moderator',true);
SET LOCAL ROLE sf_profile_runtime;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','fixture');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.dm_notifications) THEN RAISE EXCEPTION 'sender saw recipient notice'; END IF; END $$;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ DECLARE first_stamp timestamptz; BEGIN
 IF (SELECT count(*) FROM sf_core.dm_notifications)<>1 THEN RAISE EXCEPTION 'missing notice'; END IF;
 UPDATE sf_core.dm_notifications SET read_at='2000-01-01';
 SELECT read_at INTO first_stamp FROM sf_core.dm_notifications;
 IF first_stamp<now()-interval '1 minute' THEN RAISE EXCEPTION 'client timestamp accepted'; END IF;
 UPDATE sf_core.dm_notifications SET read_at=NULL;
 IF (SELECT read_at FROM sf_core.dm_notifications) IS DISTINCT FROM first_stamp THEN RAISE EXCEPTION 'ack rewound'; END IF;
 BEGIN
 INSERT INTO sf_core.dm_notifications(recipient_id,message_id) VALUES(sf_core.request_principal(),gen_random_uuid());
 RAISE EXCEPTION 'forged notice allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES(sf_core.request_principal(),'11111111-1111-4111-8111-111111111111');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.dm_notifications) THEN RAISE EXCEPTION 'blocked notice exposed'; END IF; END $$;
SELECT set_config('sf.principal_id','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sf_core.dm_notifications) THEN RAISE EXCEPTION 'staff saw private notifications'; END IF;
 BEGIN PERFORM * FROM sf_core.open_review_queue(sf_core.request_principal(),gen_random_uuid(),gen_random_uuid(),50);
 RAISE EXCEPTION 'runtime entered reviewer queue'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE a uuid:='33333333-3333-4333-8333-333333333333';s uuid:=gen_random_uuid();p uuid:=gen_random_uuid();BEGIN
 INSERT INTO sf_core.staff_stepup(id,principal_id,session_id,method,purpose,expires_at) VALUES(p,a,s,'totp','review_queue',clock_timestamp()+interval '4 minutes');
 BEGIN PERFORM * FROM sf_core.open_review_queue(a,gen_random_uuid(),p,50); RAISE EXCEPTION 'wrong session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM * FROM sf_core.open_review_queue(a,s,p,50);
 BEGIN PERFORM * FROM sf_core.open_review_queue(a,s,p,50); RAISE EXCEPTION 'proof replay'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM sf_core.staff_audit WHERE action='review_queue_open')<>1 THEN RAISE EXCEPTION 'audit missing'; END IF;
END $$;
ROLLBACK;
