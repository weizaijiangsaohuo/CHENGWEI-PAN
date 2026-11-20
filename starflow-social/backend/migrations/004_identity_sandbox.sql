-- Sandbox-only persistent identity workflow. Live environment cannot be reserved by this schema.
BEGIN;
CREATE TABLE sf_core.identity_attempts(
 id uuid PRIMARY KEY,
 principal_id uuid NOT NULL REFERENCES sf_core.principals(id) ON DELETE RESTRICT,
 provider_session_id uuid UNIQUE,
 workflow_id uuid NOT NULL,
 workflow_version integer NOT NULL CHECK(workflow_version>0),
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','pending','review','declined','cancelled','checks_passed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 CHECK(state='reserved' OR state='cancelled' OR provider_session_id IS NOT NULL)
);
CREATE UNIQUE INDEX identity_one_open ON sf_core.identity_attempts(principal_id) WHERE state IN ('reserved','pending','review');
CREATE TABLE sf_core.identity_events(
 event_id uuid PRIMARY KEY,
 attempt_id uuid NOT NULL REFERENCES sf_core.identity_attempts(id) ON DELETE RESTRICT,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sf_core.identity_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.identity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.identity_attempts,sf_core.identity_events FROM PUBLIC;
-- No general runtime access. Only migration owner can execute during the offline lab.
-- Caller MUST authenticate provider signature prior to insert and query provider current decision,
-- not trust a webhook-supplied state. CAS guards stale concurrent reconciliation.
CREATE FUNCTION sf_core.record_identity_event(p_event uuid,p_attempt uuid,p_session uuid,p_workflow uuid,p_version int)
 RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE n int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sf_core.identity_attempts a WHERE a.id=p_attempt AND a.provider_session_id=p_session
 AND a.workflow_id=p_workflow AND a.workflow_version=p_version AND a.environment='sandbox') THEN RETURN false; END IF;
 INSERT INTO sf_core.identity_events(event_id,attempt_id) VALUES(p_event,p_attempt) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
CREATE FUNCTION sf_core.reconcile_identity(p_attempt uuid,p_session uuid,p_expected_revision bigint,p_result text)
 RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE n int;
BEGIN
 IF p_result IS NULL OR p_result NOT IN ('pending','review','declined','checks_passed') THEN RETURN false; END IF;
 UPDATE sf_core.identity_attempts SET state=p_result,revision=revision+1
 WHERE id=p_attempt AND provider_session_id=p_session AND revision=p_expected_revision AND environment='sandbox'
 AND state IN ('pending','review');
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION sf_core.record_identity_event(uuid,uuid,uuid,uuid,int),sf_core.reconcile_identity(uuid,uuid,bigint,text) FROM PUBLIC;
COMMIT;
