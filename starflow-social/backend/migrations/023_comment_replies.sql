-- One-level replies and user-requested withdrawal in the new comments table only.
BEGIN;
ALTER TABLE sf_core.post_comments ADD COLUMN reply_to uuid, ADD COLUMN withdrawn_at timestamptz;
ALTER TABLE sf_core.post_comments ADD CONSTRAINT comments_post_id_unique UNIQUE(post_id,id);
ALTER TABLE sf_core.post_comments ADD CONSTRAINT comments_reply_same_post FOREIGN KEY(post_id,reply_to) REFERENCES sf_core.post_comments(post_id,id) ON DELETE RESTRICT;
ALTER TABLE sf_core.post_comments ADD CONSTRAINT comments_withdrawn_content CHECK(withdrawn_at IS NULL OR content='[已撤回]');
GRANT INSERT(reply_to),UPDATE(withdrawn_at) ON sf_core.post_comments TO sf_profile_runtime;
CREATE FUNCTION sf_core.guard_comment_reply() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'invalid comment state' USING ERRCODE='42501'; END IF;
 IF NEW.reply_to IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM sf_core.post_comments c WHERE c.id=NEW.reply_to AND c.post_id=NEW.post_id
  AND c.reply_to IS NULL AND c.withdrawn_at IS NULL
 ) THEN RAISE EXCEPTION 'reply target unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.guard_comment_reply() FROM PUBLIC;
CREATE TRIGGER comment_reply_guard BEFORE INSERT ON sf_core.post_comments FOR EACH ROW EXECUTE FUNCTION sf_core.guard_comment_reply();
CREATE FUNCTION sf_core.guard_comment_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.author_id IS DISTINCT FROM sf_core.request_principal() OR OLD.withdrawn_at IS NOT NULL
 OR NEW.id IS DISTINCT FROM OLD.id OR NEW.post_id IS DISTINCT FROM OLD.post_id
 OR NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'comment mutation denied' USING ERRCODE='42501'; END IF;
 IF NEW.withdrawn_at IS NOT NULL THEN
  NEW.withdrawn_at:=clock_timestamp();
  NEW.content:='[已撤回]';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.guard_comment_mutation() FROM PUBLIC;
CREATE TRIGGER comment_mutation_guard BEFORE UPDATE ON sf_core.post_comments FOR EACH ROW EXECUTE FUNCTION sf_core.guard_comment_mutation();
COMMIT;
