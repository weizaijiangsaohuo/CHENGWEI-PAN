\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES('33333333-3333-4333-8333-333333333333','moderator',true);
INSERT INTO sf_core.communities(id,owner_id,name) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','fixture');
INSERT INTO sf_core.community_members(community_id,principal_id) VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111'),('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222');
INSERT INTO sf_core.community_posts(id,community_id,author_id,content) VALUES('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','fixture');
SET LOCAL ROLE sf_profile_runtime;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
INSERT INTO sf_core.community_reports(post_id,reporter_id,reason) VALUES('55555555-5555-4555-8555-555555555555',sf_core.request_principal(),'spam');
DO $$ BEGIN
 BEGIN
 UPDATE sf_core.community_reports SET status='hidden';
 RAISE EXCEPTION 'user changed review status';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 INSERT INTO sf_core.staff_stepup(id,principal_id,session_id,method,purpose,expires_at) VALUES(gen_random_uuid(),sf_core.request_principal(),gen_random_uuid(),'totp','community_review',now()+interval '1 minute');
 RAISE EXCEPTION 'user minted MFA proof';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE a uuid:='33333333-3333-4333-8333-333333333333';s uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r uuid;expired uuid:=gen_random_uuid(); BEGIN
 SELECT id INTO r FROM sf_core.community_reports;
 IF sf_core.review_community_report(a,s,v,r,'hidden') THEN RAISE EXCEPTION 'missing MFA accepted'; END IF;
 INSERT INTO sf_core.staff_stepup(id,principal_id,session_id,method,purpose,verified_at,expires_at) VALUES(expired,a,s,'totp','community_review',now()-interval '10 minutes',now()-interval '6 minutes');
 IF sf_core.review_community_report(a,s,expired,r,'hidden') THEN RAISE EXCEPTION 'expired MFA accepted'; END IF;
 INSERT INTO sf_core.staff_stepup(id,principal_id,session_id,method,purpose,expires_at) VALUES(v,a,s,'webauthn_uv','community_review',clock_timestamp()+interval '4 minutes');
 IF sf_core.review_community_report(a,gen_random_uuid(),v,r,'hidden') THEN RAISE EXCEPTION 'wrong session accepted'; END IF;
 UPDATE sf_core.staff_roles SET enabled=false WHERE principal_id=a;
 IF sf_core.review_community_report(a,s,v,r,'hidden') THEN RAISE EXCEPTION 'disabled staff accepted'; END IF;
 UPDATE sf_core.staff_roles SET enabled=true WHERE principal_id=a;
 IF NOT sf_core.review_community_report(a,s,v,r,'hidden') THEN RAISE EXCEPTION 'valid lab proof refused'; END IF;
 IF sf_core.review_community_report(a,s,v,r,'dismissed') THEN RAISE EXCEPTION 'review replay accepted'; END IF;
 IF (SELECT count(*) FROM sf_core.staff_audit)<>1 THEN RAISE EXCEPTION 'audit missing'; END IF;
 IF (SELECT count(*) FROM sf_core.community_posts WHERE hidden_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'post not preserved'; END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.community_posts) THEN RAISE EXCEPTION 'hidden post exposed'; END IF; END $$;
ROLLBACK;
