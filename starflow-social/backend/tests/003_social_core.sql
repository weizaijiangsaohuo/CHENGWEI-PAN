\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
SET LOCAL ROLE sf_profile_runtime;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO sf_core.posts(author_id,content,visibility) VALUES ('11111111-1111-4111-8111-111111111111','synthetic','members');
DO $$ BEGIN
 BEGIN
  INSERT INTO sf_core.posts(author_id,content) VALUES ('22222222-2222-4222-8222-222222222222','forged');
  RAISE EXCEPTION 'author forgery permitted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid author' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO sf_core.posts(author_id,content) VALUES ('11111111-1111-4111-8111-111111111111','too soon');
  RAISE EXCEPTION 'rate bypass';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'post rate limit' THEN RAISE; END IF; END;
END $$;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ DECLARE p uuid;affected int; BEGIN
 SELECT id INTO STRICT p FROM sf_core.posts;
 UPDATE sf_core.posts SET content='tampered' WHERE id=p;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'other post editable'; END IF;
 INSERT INTO sf_core.likes(user_id,post_id) VALUES (sf_core.request_principal(),p);
 INSERT INTO sf_core.bookmarks(user_id,post_id) VALUES (sf_core.request_principal(),p);
 BEGIN
  INSERT INTO sf_core.likes(user_id,post_id) VALUES ('11111111-1111-4111-8111-111111111111',p);
  RAISE EXCEPTION 'like forgery allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sf_core.bookmarks)<>0 OR (SELECT count(*) FROM sf_core.likes)<>0 THEN RAISE EXCEPTION 'reactions leaked'; END IF;
 UPDATE sf_core.posts SET visibility='private';
END $$;
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sf_core.posts)<>0 OR (SELECT count(*) FROM sf_core.bookmarks)<>0 THEN RAISE EXCEPTION 'private visibility leaked'; END IF;
END $$;
SELECT set_config('sf.principal_id','11111111-1111-4111-8111-111111111111',true);
UPDATE sf_core.posts SET visibility='members';
INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
SELECT set_config('sf.principal_id','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sf_core.posts) OR EXISTS(SELECT 1 FROM sf_core.blocks) OR EXISTS(SELECT 1 FROM sf_core.likes) THEN RAISE EXCEPTION 'block isolation failed'; END IF;
END $$;
SELECT set_config('sf.principal_id','',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM sf_core.posts) THEN RAISE EXCEPTION 'missing context exposed posts'; END IF; END $$;
ROLLBACK;
