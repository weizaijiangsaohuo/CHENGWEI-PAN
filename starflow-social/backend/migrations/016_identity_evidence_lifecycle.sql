-- Owner-only isolated vault lifecycle. No live endpoints, scheduler or role grants.
BEGIN;
ALTER TABLE sf_core.identity_evidence_proofs ADD COLUMN purpose text NOT NULL DEFAULT 'metadata';
ALTER TABLE sf_core.identity_evidence_proofs ADD COLUMN evidence_kind text;
ALTER TABLE sf_core.identity_evidence_proofs ADD CHECK(
 (purpose='metadata' AND evidence_kind IS NULL) OR
 (purpose='material' AND evidence_kind IS NOT NULL AND evidence_kind IN ('face_photo','document_front','document_back','identity_fields'))
);
CREATE OR REPLACE FUNCTION sf_core.identity_case_metadata(p_actor uuid,p_session uuid,p_proof uuid,p_attempt uuid)
RETURNS TABLE(attempt_id uuid,principal_id uuid,state text,submitted_at timestamptz,evidence_kinds text[],retained_until timestamptz)
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM sf_core.staff_roles s JOIN sf_core.identity_evidence_reviewers r ON r.principal_id=s.principal_id
 WHERE s.principal_id=p_actor AND s.enabled AND r.enabled AND s.role IN ('founder','super_admin','verification_reviewer') FOR UPDATE OF s,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 UPDATE sf_core.identity_evidence_proofs AS proof SET consumed_at=clock_timestamp()
 WHERE proof.id=p_proof AND proof.principal_id=p_actor AND proof.session_id=p_session AND proof.attempt_id=p_attempt
 AND proof.purpose='metadata' AND proof.consumed_at IS NULL AND proof.issued_at<=clock_timestamp() AND proof.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(p_actor,'identity_case_metadata',p_attempt);
 RETURN QUERY SELECT a.id,a.principal_id,a.state,a.created_at,
 ARRAY(SELECT e.kind FROM sf_core.identity_evidence e WHERE e.attempt_id=a.id AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() ORDER BY e.kind),
 CASE WHEN c.revoked_at IS NULL AND c.expires_at>clock_timestamp() THEN c.expires_at END
 FROM sf_core.identity_attempts a LEFT JOIN sf_core.identity_evidence_consent c ON c.attempt_id=a.id WHERE a.id=p_attempt;
END $$;
-- No write while consent is absent, withdrawn or expired; never overwrite a captured item.
CREATE FUNCTION sf_core.guard_identity_evidence_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'evidence immutable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sf_core.identity_evidence_consent c WHERE c.attempt_id=NEW.attempt_id
 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 AND NEW.captured_at>=c.granted_at AND NEW.captured_at<=clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'consent required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_evidence_write_guard BEFORE INSERT OR UPDATE ON sf_core.identity_evidence
 FOR EACH ROW EXECUTE FUNCTION sf_core.guard_identity_evidence_write();
-- Trusted caller must derive actor/session from a current verified session and fresh MFA.
-- Single category, one case, single-use proof; never returns decrypted material.
CREATE FUNCTION sf_core.read_identity_evidence(p_actor uuid,p_session uuid,p_proof uuid,p_attempt uuid,p_kind text)
RETURNS TABLE(key_id text,nonce bytea,ciphertext bytea,captured_at timestamptz)
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('face_photo','document_front','document_back','identity_fields') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sf_core.staff_roles s JOIN sf_core.identity_evidence_reviewers r ON r.principal_id=s.principal_id
 WHERE s.principal_id=p_actor AND s.enabled AND r.enabled AND s.role IN ('founder','super_admin','verification_reviewer') FOR UPDATE OF s,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sf_core.identity_evidence_consent c WHERE c.attempt_id=p_attempt AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sf_core.identity_evidence e WHERE e.attempt_id=p_attempt AND e.kind=p_kind;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 UPDATE sf_core.identity_evidence_proofs AS proof SET consumed_at=clock_timestamp()
 WHERE proof.id=p_proof AND proof.principal_id=p_actor AND proof.session_id=p_session AND proof.attempt_id=p_attempt
 AND proof.purpose='material' AND proof.evidence_kind=p_kind AND proof.consumed_at IS NULL
 AND proof.issued_at<=clock_timestamp() AND proof.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO sf_core.staff_audit(actor_id,action,target_id) VALUES(p_actor,'identity_evidence_read_'||p_kind,p_attempt);
 RETURN QUERY SELECT e.key_id,e.nonce,e.ciphertext,e.captured_at FROM sf_core.identity_evidence e WHERE e.attempt_id=p_attempt AND e.kind=p_kind;
END $$;
-- Verified user can withdraw their own consent through future trusted gateway.
CREATE FUNCTION sf_core.withdraw_identity_evidence(p_subject uuid,p_attempt uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 UPDATE sf_core.identity_evidence_consent c SET revoked_at=clock_timestamp()
 WHERE c.attempt_id=p_attempt AND c.revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM sf_core.identity_attempts a WHERE a.id=c.attempt_id AND a.principal_id=p_subject);
 RETURN FOUND;
END $$;
-- Only remove expired/withdrawn evidence, never the attempt, consent or audit history.
-- Run on synthetic CI fixtures only until deletion policy and backup/provider lifecycle accepted.
CREATE FUNCTION sf_core.purge_identity_evidence(p_limit integer DEFAULT 25)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 WITH eligible AS (
 SELECT c.attempt_id FROM sf_core.identity_evidence_consent c
 WHERE (c.revoked_at IS NOT NULL OR c.expires_at<=clock_timestamp())
 AND EXISTS(SELECT 1 FROM sf_core.identity_evidence e WHERE e.attempt_id=c.attempt_id)
 ORDER BY c.expires_at,c.attempt_id
 LIMIT least(greatest(coalesce(p_limit,25),1),50) FOR UPDATE OF c SKIP LOCKED
 )
 DELETE FROM sf_core.identity_evidence e USING eligible WHERE e.attempt_id=eligible.attempt_id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION sf_core.guard_identity_evidence_write(),sf_core.read_identity_evidence(uuid,uuid,uuid,uuid,text),sf_core.withdraw_identity_evidence(uuid,uuid),sf_core.purge_identity_evidence(integer) FROM PUBLIC;
COMMIT;
