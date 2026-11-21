-- Sandbox only. No production reset authorization, session mutation or gateway grant.
-- Caller must provide a SHA-256 digest of a CSPRNG-generated 32-byte secret.
BEGIN;
CREATE TABLE sf_core.recovery_grant_lab (
 attempt_id uuid PRIMARY KEY REFERENCES sf_core.recovery_replay_lab(attempt_id) ON DELETE RESTRICT,
 token_digest bytea UNIQUE NOT NULL CHECK(octet_length(token_digest)=32),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes'),
 CHECK(consumed_at IS NULL OR (consumed_at>=issued_at AND consumed_at<expires_at)),
 CHECK(revoked_at IS NULL OR revoked_at>=issued_at),
 CHECK(consumed_at IS NULL OR revoked_at IS NULL)
);
ALTER TABLE sf_core.recovery_grant_lab ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.recovery_grant_lab FROM PUBLIC,sf_account_recovery_gateway;
CREATE FUNCTION sf_core.issue_recovery_grant_lab(p_attempt uuid,p_subject uuid,p_digest bytea)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 IF p_subject IS NULL OR p_digest IS NULL OR octet_length(p_digest)<>32
 OR NOT sf_core.ordinary_recovery_allowed(p_subject,NULL) THEN RETURN false; END IF;
 INSERT INTO sf_core.recovery_grant_lab(attempt_id,token_digest,issued_at,expires_at)
 SELECT r.attempt_id,p_digest,t,least(r.expires_at,t+interval '5 minutes')
 FROM sf_core.recovery_replay_lab r
 WHERE r.attempt_id=p_attempt AND r.subject=p_subject AND r.expires_at>t
 ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
CREATE FUNCTION sf_core.consume_recovery_grant_lab(p_attempt uuid,p_subject uuid,p_secret bytea)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t timestamptz;
BEGIN
 IF p_subject IS NULL OR p_secret IS NULL OR octet_length(p_secret)<>32 THEN RETURN false; END IF;
 -- Serialize competing consumption/revocation. Recheck expiry after acquiring the row lock.
 PERFORM 1 FROM sf_core.recovery_grant_lab g WHERE g.attempt_id=p_attempt
 AND g.token_digest=sha256(p_secret) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 t:=clock_timestamp();
 IF NOT sf_core.ordinary_recovery_allowed(p_subject,NULL) THEN RETURN false; END IF;
 UPDATE sf_core.recovery_grant_lab g SET consumed_at=t
 FROM sf_core.recovery_replay_lab r
 WHERE g.attempt_id=p_attempt AND r.attempt_id=g.attempt_id AND r.subject=p_subject
 AND r.expires_at>t AND g.expires_at>t AND g.consumed_at IS NULL AND g.revoked_at IS NULL
 AND g.token_digest=sha256(p_secret);
 RETURN FOUND;
END $$;
CREATE FUNCTION sf_core.revoke_recovery_grant_lab(p_attempt uuid,p_subject uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 UPDATE sf_core.recovery_grant_lab g SET revoked_at=clock_timestamp()
 FROM sf_core.recovery_replay_lab r
 WHERE g.attempt_id=p_attempt AND r.attempt_id=g.attempt_id AND r.subject=p_subject
 AND g.consumed_at IS NULL AND g.revoked_at IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION sf_core.issue_recovery_grant_lab(uuid,uuid,bytea),sf_core.consume_recovery_grant_lab(uuid,uuid,bytea),sf_core.revoke_recovery_grant_lab(uuid,uuid) FROM PUBLIC,sf_account_recovery_gateway;
COMMIT;
