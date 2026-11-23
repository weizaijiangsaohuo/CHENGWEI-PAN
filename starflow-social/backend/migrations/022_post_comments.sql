-- Text comments only, private-by-default parent posts remain private.
-- Additive change for the isolated backend, no modification of legacy data.
BEGIN;
CREATE TABLE sf_core.post_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES sf_core.posts(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 content text NOT NULL CHECK(char_length(btrim(content)) BETWEEN 1 AND 280),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX comments_post_page ON sf_core.post_comments(post_id,created_at DESC,id DESC);
ALTER TABLE sf_core.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.post_comments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.post_comments FROM PUBLIC;
GRANT SELECT ON sf_core.post_comments TO sf_profile_runtime;
GRANT INSERT(post_id,author_id,content),UPDATE(content) ON sf_core.post_comments TO sf_profile_runtime;
CREATE POLICY comments_read ON sf_core.post_comments FOR SELECT TO sf_profile_runtime USING(
 sf_core.can_view_author(author_id) AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id)
);
CREATE POLICY comments_insert ON sf_core.post_comments FOR INSERT TO sf_profile_runtime WITH CHECK(
 author_id=sf_core.request_principal() AND sf_core.can_view_author(author_id)
 AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id)
);
CREATE POLICY comments_edit ON sf_core.post_comments FOR UPDATE TO sf_profile_runtime USING(
 author_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id)
) WITH CHECK(
 author_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id)
);
-- Separate throttle survives changes to parent visibility; no direct application grants.
CREATE TABLE sf_core.comment_throttle(
 principal_id uuid PRIMARY KEY REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 last_created_at timestamptz NOT NULL
);
ALTER TABLE sf_core.comment_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.comment_throttle FROM PUBLIC;
CREATE FUNCTION sf_core.guard_comment_rate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer; t timestamptz:=clock_timestamp();
BEGIN
 IF NEW.author_id IS DISTINCT FROM sf_core.request_principal() THEN RAISE EXCEPTION 'invalid comment author' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.comment_throttle(principal_id,last_created_at) VALUES(NEW.author_id,t)
 ON CONFLICT(principal_id) DO UPDATE SET last_created_at=EXCLUDED.last_created_at
 WHERE sf_core.comment_throttle.last_created_at<=EXCLUDED.last_created_at-interval '5 seconds';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'comment rate limit' USING ERRCODE='P0001'; END IF;
 NEW.created_at:=t;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.guard_comment_rate() FROM PUBLIC;
CREATE TRIGGER comment_rate BEFORE INSERT ON sf_core.post_comments FOR EACH ROW EXECUTE FUNCTION sf_core.guard_comment_rate();
COMMIT;
