-- Separate trusted verifier role. No login, no raw evidence access.
BEGIN;
CREATE ROLE sf_identity_proof_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT USAGE ON SCHEMA sf_core TO sf_identity_proof_issuer;
CREATE TABLE sf_core.identity_totp_replays(
 proof_id uuid PRIMARY KEY REFERENCES sf_core.identity_queue_proofs(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL REFERENCES sf_core.identity_evidence_reviewers(principal_id) ON DELETE RESTRICT,
 fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX identity_totp_replay_lookup ON sf_core.identity_totp_replays(principal_id,issued_at);
ALTER TABLE sf_core.identity_totp_replays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.identity_totp_replays FROM PUBLIC;
-- Only trusted MFA verifier may call AFTER checking real TOTP and authenticated session.
-- Row lock serializes all issuance for this staff member across concurrent sessions.
CREATE FUNCTION sf_core.issue_identity_queue_proof(p_subject uuid,p_session uuid,p_filter uuid,p_before uuid,p_fingerprint bytea)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; proof uuid:=gen_random_uuid();
BEGIN
 IF p_session IS NULL OR p_fingerprint IS NULL OR octet_length(p_fingerprint)<>32 THEN RETURN NULL; END IF;
 SELECT b.principal_id INTO actor FROM sf_core.auth_bindings b WHERE b.auth_subject=p_subject;
 IF actor IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM sf_core.staff_roles s JOIN sf_core.identity_evidence_reviewers r ON r.principal_id=s.principal_id
 WHERE s.principal_id=actor AND s.enabled AND r.enabled AND s.role IN ('founder','super_admin','verification_reviewer') FOR UPDATE OF s,r;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_filter IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sf_core.principals p WHERE p.id=p_filter) THEN RETURN NULL; END IF;
 IF p_before IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sf_core.identity_attempts a WHERE a.id=p_before AND (p_filter IS NULL OR a.principal_id=p_filter)) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.identity_totp_replays r WHERE r.principal_id=actor AND r.fingerprint=p_fingerprint AND r.issued_at>clock_timestamp()-interval '3 minutes') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM sf_core.identity_totp_replays r WHERE r.principal_id=actor AND r.issued_at>clock_timestamp()-interval '5 minutes')>=10 THEN RETURN NULL; END IF;
 INSERT INTO sf_core.identity_queue_proofs(id,principal_id,session_id,subject_filter,before_attempt,expires_at,method)
 VALUES(proof,actor,p_session,p_filter,p_before,clock_timestamp()+interval '2 minutes','totp');
 INSERT INTO sf_core.identity_totp_replays(proof_id,principal_id,fingerprint) VALUES(proof,actor,p_fingerprint);
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(actor,'identity_queue_stepup',p_filter);
 RETURN proof;
END $$;
REVOKE ALL ON FUNCTION sf_core.issue_identity_queue_proof(uuid,uuid,uuid,uuid,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.issue_identity_queue_proof(uuid,uuid,uuid,uuid,bytea) TO sf_identity_proof_issuer;
COMMIT;
