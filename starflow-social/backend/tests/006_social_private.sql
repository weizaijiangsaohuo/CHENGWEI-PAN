\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO sf_core.communities(id,owner_id,name) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','Synthetic');
INSERT INTO sf_core.community_members(community_id,principal_id,role) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','owner');
SET LOCAL ROLE sf_profile_runtime;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sf_core.follows(follower_id,target_id) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222');
DO $$ DECLARE n int; BEGIN
 UPDATE sf_core.follows SET accepted=true; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'self-approval allowed'; END IF;
 BEGIN
 INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','premature');
 RAISE EXCEPTION 'DM before consent';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO sf_core.community_posts(community_id,author_id,content) VALUES('44444444-4444-4444-8444-444444444444',sf_core.request_principal(),'private community');
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
UPDATE sf_core.follows SET accepted=true;
INSERT INTO sf_core.follows(follower_id,target_id) VALUES(sf_core.request_principal(),'11111111-1111-4111-8111-111111111111');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sf_core.communities) OR EXISTS(SELECT 1 FROM sf_core.community_posts) THEN RAISE EXCEPTION 'private community leaked'; END IF;
 BEGIN
 INSERT INTO sf_core.community_members(community_id,principal_id) VALUES('44444444-4444-4444-8444-444444444444',sf_core.request_principal());
 RAISE EXCEPTION 'self membership allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES(sf_core.request_principal(),'founder',true);
 RAISE EXCEPTION 'staff privilege escalation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
UPDATE sf_core.follows SET accepted=true WHERE target_id=sf_core.request_principal();
INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','hello');
SELECT set_config('sf.principal_id','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.direct_messages) OR EXISTS(SELECT 1 FROM sf_core.follows) THEN RAISE EXCEPTION 'third party privacy leak'; END IF; END $$;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN IF (SELECT count(*) FROM sf_core.direct_messages)<>1 THEN RAISE EXCEPTION 'recipient cannot read'; END IF; END $$;
INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES(sf_core.request_principal(),'11111111-1111-4111-8111-111111111111');
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sf_core.direct_messages) OR EXISTS(SELECT 1 FROM sf_core.follows) THEN RAISE EXCEPTION 'blocked row leaked'; END IF;
 BEGIN
 INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES(sf_core.request_principal(),'22222222-2222-4222-8222-222222222222','blocked');
 RAISE EXCEPTION 'blocked send allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
