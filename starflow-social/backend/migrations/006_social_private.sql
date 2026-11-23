-- Isolated new backend: all follow requests require explicit recipient approval.
BEGIN;
CREATE TABLE sf_core.follows(
 follower_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 accepted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(follower_id,target_id),CHECK(follower_id<>target_id)
);
CREATE INDEX follows_target ON sf_core.follows(target_id,follower_id);
ALTER TABLE sf_core.follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.follows FROM PUBLIC;
GRANT SELECT,DELETE ON sf_core.follows TO sf_profile_runtime;
GRANT INSERT(follower_id,target_id),UPDATE(accepted) ON sf_core.follows TO sf_profile_runtime;
CREATE POLICY follow_read ON sf_core.follows FOR SELECT TO sf_profile_runtime USING(
 (follower_id=sf_core.request_principal() AND sf_core.can_view_author(target_id))
 OR (target_id=sf_core.request_principal() AND sf_core.can_view_author(follower_id)));
CREATE POLICY follow_request ON sf_core.follows FOR INSERT TO sf_profile_runtime WITH CHECK(
 follower_id=sf_core.request_principal() AND NOT accepted AND sf_core.can_view_author(target_id));
CREATE POLICY follow_accept ON sf_core.follows FOR UPDATE TO sf_profile_runtime USING(target_id=sf_core.request_principal())
 WITH CHECK(target_id=sf_core.request_principal() AND accepted AND sf_core.can_view_author(follower_id));
CREATE POLICY follow_remove ON sf_core.follows FOR DELETE TO sf_profile_runtime USING(
 follower_id=sf_core.request_principal() OR target_id=sf_core.request_principal());
-- Remove follow relationships on either-direction block, including previously accepted requests.
CREATE FUNCTION sf_core.clear_blocked_follows() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 DELETE FROM sf_core.follows WHERE (follower_id=NEW.blocker_id AND target_id=NEW.blocked_id)
 OR (follower_id=NEW.blocked_id AND target_id=NEW.blocker_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.clear_blocked_follows() FROM PUBLIC;
CREATE TRIGGER clear_blocked_follows AFTER INSERT ON sf_core.blocks FOR EACH ROW EXECUTE FUNCTION sf_core.clear_blocked_follows();
-- Private messaging: requires mutual accepted follows. No attachments or realtime yet.
CREATE TABLE sf_core.direct_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_id<>recipient_id)
);
CREATE INDEX direct_messages_sender ON sf_core.direct_messages(sender_id,created_at DESC);
CREATE INDEX direct_messages_recipient ON sf_core.direct_messages(recipient_id,created_at DESC);
ALTER TABLE sf_core.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.direct_messages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.direct_messages FROM PUBLIC;
GRANT SELECT ON sf_core.direct_messages TO sf_profile_runtime;
GRANT INSERT(sender_id,recipient_id,body) ON sf_core.direct_messages TO sf_profile_runtime;
CREATE POLICY dm_read ON sf_core.direct_messages FOR SELECT TO sf_profile_runtime USING(
 (sender_id=sf_core.request_principal() AND sf_core.can_view_author(recipient_id))
 OR (recipient_id=sf_core.request_principal() AND sf_core.can_view_author(sender_id)));
CREATE POLICY dm_send ON sf_core.direct_messages FOR INSERT TO sf_profile_runtime WITH CHECK(
 sender_id=sf_core.request_principal() AND sf_core.can_view_author(recipient_id)
 AND EXISTS(SELECT 1 FROM sf_core.follows f WHERE f.follower_id=sender_id AND f.target_id=recipient_id AND f.accepted)
 AND EXISTS(SELECT 1 FROM sf_core.follows f WHERE f.follower_id=recipient_id AND f.target_id=sender_id AND f.accepted));
-- Private community foundation. Membership changes deliberately not granted to runtime yet.
CREATE TABLE sf_core.communities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 80)
);
CREATE TABLE sf_core.community_members(
 community_id uuid NOT NULL REFERENCES sf_core.communities(id) ON DELETE CASCADE,
 principal_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','owner')),
 PRIMARY KEY(community_id,principal_id)
);
CREATE TABLE sf_core.community_posts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id uuid NOT NULL REFERENCES sf_core.communities(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(char_length(btrim(content)) BETWEEN 1 AND 280),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sf_core.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.community_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.communities,sf_core.community_members,sf_core.community_posts FROM PUBLIC;
GRANT SELECT ON sf_core.communities,sf_core.community_members,sf_core.community_posts TO sf_profile_runtime;
GRANT INSERT(community_id,author_id,content) ON sf_core.community_posts TO sf_profile_runtime;
CREATE POLICY community_member_self ON sf_core.community_members FOR SELECT TO sf_profile_runtime USING(principal_id=sf_core.request_principal());
CREATE POLICY community_read ON sf_core.communities FOR SELECT TO sf_profile_runtime USING(
 EXISTS(SELECT 1 FROM sf_core.community_members m WHERE m.community_id=id AND m.principal_id=sf_core.request_principal()));
CREATE POLICY community_post_read ON sf_core.community_posts FOR SELECT TO sf_profile_runtime USING(
 EXISTS(SELECT 1 FROM sf_core.community_members m WHERE m.community_id=community_posts.community_id AND m.principal_id=sf_core.request_principal())
 AND (author_id=sf_core.request_principal() OR sf_core.can_view_author(author_id)));
CREATE POLICY community_post_write ON sf_core.community_posts FOR INSERT TO sf_profile_runtime WITH CHECK(
 author_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.community_members m
 WHERE m.community_id=community_posts.community_id AND m.principal_id=sf_core.request_principal()));
-- Staff roles and audit only; no runtime access, and no founder account automatically created.
CREATE TABLE sf_core.staff_roles(
 principal_id uuid PRIMARY KEY REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK(role IN ('founder','super_admin','official','senior_admin','moderator','verification_reviewer','support','analyst')),
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE sf_core.staff_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(char_length(action) BETWEEN 3 AND 80),
 target_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sf_core.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.staff_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.staff_roles,sf_core.staff_audit FROM PUBLIC;
COMMIT;
