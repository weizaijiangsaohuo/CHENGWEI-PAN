-- Sandbox replay barrier only. No reset credential, biometric data or runtime grant.
-- Do not install in production or wire to a public route.
BEGIN;
CREATE TABLE sf_core.recovery_replay_lab (
 attempt_id uuid PRIMARY KEY,
 proof_id uuid NOT NULL UNIQUE,
 possession_id uuid NOT NULL UNIQUE,
 provider_session_id uuid NOT NULL UNIQUE,
 subject uuid NOT NULL,
 claimed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK (expires_at>claimed_at AND expires_at<=claimed_at+interval '15 minutes')
);
ALTER TABLE sf_core.recovery_replay_lab ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.recovery_replay_lab FROM PUBLIC,sf_account_recovery_gateway;
-- Owner-only sandbox helper: all IDs must come from trusted records. It is NOT proof of identity.
-- Unique constraints arbitrate concurrent claims, including across different attempts/subjects.
CREATE FUNCTION sf_core.claim_recovery_replay_lab(
 p_attempt uuid,p_proof uuid,p_possession uuid,p_session uuid,p_subject uuid,p_expires timestamptz
) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 IF p_attempt IS NULL OR p_proof IS NULL OR p_possession IS NULL OR p_session IS NULL
 OR p_subject IS NULL OR p_expires IS NULL OR p_expires<=t OR p_expires>t+interval '15 minutes'
 OR NOT sf_core.ordinary_recovery_allowed(p_subject,NULL) THEN RETURN false; END IF;
 INSERT INTO sf_core.recovery_replay_lab(attempt_id,proof_id,possession_id,provider_session_id,subject,claimed_at,expires_at)
 VALUES(p_attempt,p_proof,p_possession,p_session,p_subject,t,p_expires)
 ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION sf_core.claim_recovery_replay_lab(uuid,uuid,uuid,uuid,uuid,timestamptz) FROM PUBLIC,sf_account_recovery_gateway;
COMMIT;
