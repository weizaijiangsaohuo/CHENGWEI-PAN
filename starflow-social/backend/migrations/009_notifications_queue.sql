-- Isolated database; no cloud delivery, recurring jobs, or external services.
BEGIN;
CREATE TABLE sf_core.dm_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 message_id uuid NOT NULL UNIQUE REFERENCES sf_core.direct_messages(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 read_at timestamptz
);
CREATE INDEX dm_notifications_inbox ON sf_core.dm_notifications(recipient_id,created_at DESC);
ALTER TABLE sf_core.dm_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.dm_notifications FROM PUBLIC;
GRANT SELECT ON sf_core.dm_notifications TO sf_profile_runtime;
GRANT UPDATE(read_at) ON sf_core.dm_notifications TO sf_profile_runtime;
CREATE POLICY dm_notice_read ON sf_core.dm_notifications FOR SELECT TO sf_profile_runtime USING(
 recipient_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.direct_messages m WHERE m.id=message_id));
CREATE POLICY dm_notice_ack ON sf_core.dm_notifications FOR UPDATE TO sf_profile_runtime USING(
 recipient_id=sf_core.request_principal() AND EXISTS(SELECT 1 FROM sf_core.direct_messages m WHERE m.id=message_id))
 WITH CHECK(recipient_id=sf_core.request_principal() AND read_at IS NOT NULL);
CREATE FUNCTION sf_core.create_dm_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO sf_core.dm_notifications(recipient_id,message_id) VALUES(NEW.recipient_id,NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.create_dm_notice() FROM PUBLIC;
CREATE TRIGGER dm_notice_after_insert AFTER INSERT ON sf_core.direct_messages FOR EACH ROW EXECUTE FUNCTION sf_core.create_dm_notice();
CREATE FUNCTION sf_core.stamp_dm_notice() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.read_at:=coalesce(OLD.read_at,clock_timestamp());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.stamp_dm_notice() FROM PUBLIC;
CREATE TRIGGER dm_notice_stamp BEFORE UPDATE OF read_at ON sf_core.dm_notifications FOR EACH ROW EXECUTE FUNCTION sf_core.stamp_dm_notice();
-- Staff dashboard read model. No private message access, no PII, no role assignment.
-- Owner-only in lab; actual trusted fresh MFA issuer is still required.
ALTER TABLE sf_core.staff_stepup DROP CONSTRAINT staff_stepup_purpose_check;
ALTER TABLE sf_core.staff_stepup ADD CHECK(purpose IN ('community_review','review_queue'));
CREATE FUNCTION sf_core.open_review_queue(p_actor uuid,p_session uuid,p_proof uuid,p_limit int DEFAULT 50)
RETURNS TABLE(report_id uuid,reason text,created_at timestamptz)
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM sf_core.staff_roles WHERE principal_id=p_actor AND enabled
 AND role IN ('founder','super_admin','senior_admin','moderator') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 UPDATE sf_core.staff_stepup SET consumed_at=clock_timestamp()
 WHERE id=p_proof AND principal_id=p_actor AND session_id=p_session AND purpose='review_queue'
 AND consumed_at IS NULL AND verified_at<=clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action) VALUES(p_actor,'review_queue_open');
 RETURN QUERY SELECT r.id,r.reason,r.created_at FROM sf_core.community_reports r WHERE r.status='pending'
 ORDER BY r.created_at,r.id LIMIT least(greatest(coalesce(p_limit,50),1),100);
END $$;
REVOKE ALL ON FUNCTION sf_core.open_review_queue(uuid,uuid,uuid,int) FROM PUBLIC;
COMMIT;
