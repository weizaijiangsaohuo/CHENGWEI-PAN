-- Disabled-by-default evidence vault. Owner-only; no runtime grants.
-- No real evidence may be collected before necessity, consent, key custody and purge acceptance.
BEGIN;
CREATE TABLE sf_core.identity_evidence_consent(
 attempt_id uuid PRIMARY KEY REFERENCES sf_core.identity_attempts(id) ON DELETE RESTRICT,
 policy_version text NOT NULL CHECK(char_length(policy_version) BETWEEN 1 AND 80),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(expires_at>granted_at AND expires_at<=granted_at+interval '7 days')
);
CREATE TABLE sf_core.identity_evidence(
 attempt_id uuid NOT NULL REFERENCES sf_core.identity_evidence_consent(attempt_id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('face_photo','document_front','document_back','identity_fields')),
 key_id text NOT NULL CHECK(key_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 17 AND 2097168),
 captured_at timestamptz NOT NULL,
 PRIMARY KEY(attempt_id,kind),
 UNIQUE(key_id,nonce),
 CHECK(kind<>'identity_fields' OR octet_length(ciphertext)<=16400)
);
-- Explicit scoped permission distinct from ordinary badge moderation.
CREATE TABLE sf_core.identity_evidence_reviewers(
 principal_id uuid PRIMARY KEY REFERENCES sf_core.staff_roles(principal_id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE sf_core.identity_evidence_proofs(
 id uuid PRIMARY KEY,
 principal_id uuid NOT NULL REFERENCES sf_core.identity_evidence_reviewers(principal_id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,
 attempt_id uuid NOT NULL REFERENCES sf_core.identity_attempts(id) ON DELETE RESTRICT,
 method text NOT NULL CHECK(method IN ('totp','webauthn_uv')),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes')
);
ALTER TABLE sf_core.identity_evidence_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.identity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.identity_evidence_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.identity_evidence_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.identity_evidence_consent,sf_core.identity_evidence,sf_core.identity_evidence_reviewers,sf_core.identity_evidence_proofs FROM PUBLIC;
-- Metadata only. No document numbers, names, photos, media URLs or key material.
CREATE FUNCTION sf_core.identity_case_metadata(p_actor uuid,p_session uuid,p_proof uuid,p_attempt uuid)
RETURNS TABLE(attempt_id uuid,principal_id uuid,state text,submitted_at timestamptz,evidence_kinds text[],retained_until timestamptz)
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM sf_core.staff_roles s JOIN sf_core.identity_evidence_reviewers r ON r.principal_id=s.principal_id
 WHERE s.principal_id=p_actor AND s.enabled AND r.enabled AND s.role IN ('founder','super_admin','verification_reviewer') FOR UPDATE OF s,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 UPDATE sf_core.identity_evidence_proofs SET consumed_at=clock_timestamp()
 WHERE id=p_proof AND principal_id=p_actor AND session_id=p_session AND attempt_id=p_attempt
 AND consumed_at IS NULL AND issued_at<=clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(p_actor,'identity_case_metadata',p_attempt);
 RETURN QUERY SELECT a.id,a.principal_id,a.state,a.created_at,
 ARRAY(SELECT e.kind FROM sf_core.identity_evidence e WHERE e.attempt_id=a.id AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() ORDER BY e.kind),
 CASE WHEN c.revoked_at IS NULL AND c.expires_at>clock_timestamp() THEN c.expires_at END
 FROM sf_core.identity_attempts a LEFT JOIN sf_core.identity_evidence_consent c ON c.attempt_id=a.id WHERE a.id=p_attempt;
END $$;
REVOKE ALL ON FUNCTION sf_core.identity_case_metadata(uuid,uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
