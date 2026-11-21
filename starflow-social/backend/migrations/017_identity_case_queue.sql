-- Isolated identity workbench listing. No raw material, public endpoint or login credential.
BEGIN;
CREATE ROLE sf_identity_queue_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT USAGE ON SCHEMA sf_core TO sf_identity_queue_gateway;
CREATE TABLE sf_core.identity_queue_proofs(
 id uuid PRIMARY KEY,
 principal_id uuid NOT NULL REFERENCES sf_core.identity_evidence_reviewers(principal_id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,
 subject_filter uuid REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 before_attempt uuid REFERENCES sf_core.identity_attempts(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 method text NOT NULL CHECK(method IN ('totp','webauthn_uv')),
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes')
);
ALTER TABLE sf_core.identity_queue_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.identity_queue_proofs FROM PUBLIC;
CREATE INDEX identity_queue_order ON sf_core.identity_attempts(created_at DESC,id DESC);
-- Trusted gateway derives subject and session from actual authentication. Owner-only proof issuance.
CREATE FUNCTION sf_core.list_identity_cases(p_subject uuid,p_session uuid,p_proof uuid,p_filter uuid,p_before uuid)
RETURNS TABLE(attempt_id uuid,principal_id uuid,state text,submitted_at timestamptz,evidence_kinds text[],retained_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; anchor_time timestamptz;
BEGIN
 SELECT b.principal_id INTO actor FROM sf_core.auth_bindings b WHERE b.auth_subject=p_subject;
 IF actor IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sf_core.staff_roles s JOIN sf_core.identity_evidence_reviewers r ON r.principal_id=s.principal_id
 WHERE s.principal_id=actor AND s.enabled AND r.enabled AND s.role IN ('founder','super_admin','verification_reviewer') FOR UPDATE OF s,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF p_before IS NOT NULL THEN
  SELECT a.created_at INTO anchor_time FROM sf_core.identity_attempts a WHERE a.id=p_before AND (p_filter IS NULL OR a.principal_id=p_filter);
  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 END IF;
 UPDATE sf_core.identity_queue_proofs q SET consumed_at=clock_timestamp()
 WHERE q.id=p_proof AND q.principal_id=actor AND q.session_id=p_session
 AND q.subject_filter IS NOT DISTINCT FROM p_filter AND q.before_attempt IS NOT DISTINCT FROM p_before
 AND q.consumed_at IS NULL AND q.issued_at<=clock_timestamp() AND q.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(actor,'identity_case_list',p_filter);
 RETURN QUERY SELECT a.id,a.principal_id,a.state,a.created_at,
 ARRAY(SELECT e.kind FROM sf_core.identity_evidence e WHERE e.attempt_id=a.id AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() ORDER BY e.kind),
 CASE WHEN c.revoked_at IS NULL AND c.expires_at>clock_timestamp() THEN c.expires_at END
 FROM sf_core.identity_attempts a LEFT JOIN sf_core.identity_evidence_consent c ON c.attempt_id=a.id
 WHERE (p_filter IS NULL OR a.principal_id=p_filter) AND (p_before IS NULL OR (a.created_at,a.id)<(anchor_time,p_before))
 ORDER BY a.created_at DESC,a.id DESC LIMIT 51;
END $$;
REVOKE ALL ON FUNCTION sf_core.list_identity_cases(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.list_identity_cases(uuid,uuid,uuid,uuid,uuid) TO sf_identity_queue_gateway;
COMMIT;
