-- Isolated new backend; no live application route. Default visibility private.
BEGIN;
CREATE TABLE sf_core.blocks(
 blocker_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 blocked_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE INDEX blocks_reverse ON sf_core.blocks(blocked_id,blocker_id);
ALTER TABLE sf_core.blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.blocks FROM PUBLIC;
GRANT SELECT,DELETE ON sf_core.blocks TO sf_profile_runtime;
GRANT INSERT(blocker_id,blocked_id) ON sf_core.blocks TO sf_profile_runtime;
CREATE POLICY blocks_self ON sf_core.blocks FOR ALL TO sf_profile_runtime
 USING(blocker_id=sf_core.request_principal()) WITH CHECK(blocker_id=sf_core.request_principal());
-- Tight helper: caller can test only its own relationship with target. Owner must be trusted.
CREATE FUNCTION sf_core.can_view_author(p_author uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT sf_core.request_principal() IS NOT NULL AND p_author IS NOT NULL
 AND EXISTS(SELECT 1 FROM sf_core.principals WHERE id=sf_core.request_principal())
 AND NOT EXISTS(SELECT 1 FROM sf_core.blocks WHERE
 (blocker_id=sf_core.request_principal() AND blocked_id=p_author) OR
 (blocked_id=sf_core.request_principal() AND blocker_id=p_author))
$$;
REVOKE ALL ON FUNCTION sf_core.can_view_author(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.can_view_author(uuid) TO sf_profile_runtime;
CREATE TABLE sf_core.posts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(char_length(btrim(content)) BETWEEN 1 AND 280),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','members')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_author_time ON sf_core.posts(author_id,created_at DESC);
CREATE INDEX posts_time ON sf_core.posts(created_at DESC);
ALTER TABLE sf_core.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.posts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.posts FROM PUBLIC;
GRANT SELECT,DELETE ON sf_core.posts TO sf_profile_runtime;
GRANT INSERT(author_id,content,visibility),UPDATE(content,visibility) ON sf_core.posts TO sf_profile_runtime;
CREATE POLICY posts_read ON sf_core.posts FOR SELECT TO sf_profile_runtime USING(
 author_id=sf_core.request_principal() OR (visibility='members' AND sf_core.can_view_author(author_id)));
CREATE POLICY posts_insert ON sf_core.posts FOR INSERT TO sf_profile_runtime WITH CHECK(author_id=sf_core.request_principal());
CREATE POLICY posts_update ON sf_core.posts FOR UPDATE TO sf_profile_runtime USING(author_id=sf_core.request_principal()) WITH CHECK(author_id=sf_core.request_principal());
CREATE POLICY posts_delete ON sf_core.posts FOR DELETE TO sf_profile_runtime USING(author_id=sf_core.request_principal());
CREATE FUNCTION sf_core.guard_post_rate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.author_id IS DISTINCT FROM sf_core.request_principal() THEN RAISE EXCEPTION 'invalid author'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.author_id::text,52));
 NEW.created_at:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.author_id=NEW.author_id AND p.created_at>NEW.created_at-interval '5 seconds') THEN
 RAISE EXCEPTION 'post rate limit' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.guard_post_rate() FROM PUBLIC;
CREATE TRIGGER post_rate BEFORE INSERT ON sf_core.posts FOR EACH ROW EXECUTE FUNCTION sf_core.guard_post_rate();
CREATE TABLE sf_core.likes(
 user_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 post_id uuid NOT NULL REFERENCES sf_core.posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,post_id)
);
CREATE TABLE sf_core.bookmarks(LIKE sf_core.likes INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE sf_core.bookmarks ADD FOREIGN KEY(user_id) REFERENCES sf_core.principals(id) ON DELETE CASCADE;
ALTER TABLE sf_core.bookmarks ADD FOREIGN KEY(post_id) REFERENCES sf_core.posts(id) ON DELETE CASCADE;
ALTER TABLE sf_core.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.likes FORCE ROW LEVEL SECURITY;
ALTER TABLE sf_core.bookmarks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.likes,sf_core.bookmarks FROM PUBLIC;
GRANT SELECT,DELETE ON sf_core.likes,sf_core.bookmarks TO sf_profile_runtime;
GRANT INSERT(user_id,post_id) ON sf_core.likes,sf_core.bookmarks TO sf_profile_runtime;
CREATE POLICY like_read ON sf_core.likes FOR SELECT TO sf_profile_runtime USING(user_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id));
CREATE POLICY like_insert ON sf_core.likes FOR INSERT TO sf_profile_runtime WITH CHECK(user_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id));
CREATE POLICY like_delete ON sf_core.likes FOR DELETE TO sf_profile_runtime USING(user_id=sf_core.request_principal());
CREATE POLICY bookmark_read ON sf_core.bookmarks FOR SELECT TO sf_profile_runtime USING(user_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id));
CREATE POLICY bookmark_insert ON sf_core.bookmarks FOR INSERT TO sf_profile_runtime WITH CHECK(user_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.posts p WHERE p.id=post_id));
CREATE POLICY bookmark_delete ON sf_core.bookmarks FOR DELETE TO sf_profile_runtime USING(user_id=sf_core.request_principal());
COMMIT;
