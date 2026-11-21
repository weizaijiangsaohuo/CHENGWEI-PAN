-- Offline authorization foundation; not a live MFA issuer or public endpoint.
BEGIN;
CREATE TABLE sf_core.staff_stepup(
 id uuid PRIMARY KEY,
 principal_id uuid NOT NULL REFERENCES sf_core.staff_roles(principal_id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('totp','webauthn_uv')),
 purpose text NOT NULL CHECK(purpose='community_review'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '5 minutes')
);
ALTER TABLE sf_core.staff_stepup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.staff_stepup FROM PUBLIC;
-- Only trusted, isolated MFA verifier may eventually write proof rows after actual fresh
-- cryptographic verification. No runtime role is granted this privilege now.
CREATE TABLE sf_core.community_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES sf_core.community_posts(id) ON DELETE RESTRICT,
 reporter_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(reason IN ('spam','harassment','other')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dismissed','hidden')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(post_id,reporter_id)
);
ALTER TABLE sf_core.community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.community_reports FROM PUBLIC;
GRANT INSERT(post_id,reporter_id,reason),SELECT ON sf_core.community_reports TO sf_profile_runtime;
CREATE POLICY report_self_read ON sf_core.community_reports FOR SELECT TO sf_profile_runtime USING(reporter_id=sf_core.request_principal());
CREATE POLICY report_visible_post ON sf_core.community_reports FOR INSERT TO sf_profile_runtime WITH CHECK(
 reporter_id=sf_core.request_principal() AND status='pending' AND EXISTS(
 SELECT 1 FROM sf_core.community_posts p WHERE p.id=post_id));
ALTER TABLE sf_core.community_posts ADD COLUMN hidden_at timestamptz;
DROP POLICY community_post_read ON sf_core.community_posts;
CREATE POLICY community_post_read ON sf_core.community_posts FOR SELECT TO sf_profile_runtime USING(
 hidden_at IS NULL AND EXISTS(SELECT 1 FROM sf_core.community_members m WHERE m.community_id=community_posts.community_id AND m.principal_id=sf_core.request_principal())
 AND (author_id=sf_core.request_principal() OR sf_core.can_view_author(author_id)));
-- Owner-only in lab. Trusted service must supply current server-verified session ID,
-- not client headers or session data. A real verifier and dedicated restricted role are prerequisites.
CREATE FUNCTION sf_core.review_community_report(p_actor uuid,p_session uuid,p_proof uuid,p_report uuid,p_decision text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE n int; p uuid;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('dismissed','hidden') THEN RETURN false; END IF;
 PERFORM 1 FROM sf_core.staff_roles WHERE principal_id=p_actor AND enabled
 AND role IN ('founder','super_admin','senior_admin','moderator') FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT post_id INTO p FROM sf_core.community_reports WHERE id=p_report AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE sf_core.staff_stepup SET consumed_at=clock_timestamp()
 WHERE id=p_proof AND principal_id=p_actor AND session_id=p_session AND purpose='community_review'
 AND consumed_at IS NULL AND verified_at<=clock_timestamp() AND expires_at>clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN false; END IF;
 UPDATE sf_core.community_reports SET status=p_decision WHERE id=p_report;
 IF p_decision='hidden' THEN UPDATE sf_core.community_posts SET hidden_at=clock_timestamp() WHERE id=p; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(p_actor,'community_review_'||p_decision,p_report);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sf_core.review_community_report(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
COMMIT;
