-- Atomic sandbox-only acceptance of independently authenticated provider results.
-- Migration owner only; no live route, new credentials, or runtime grant.
BEGIN;
CREATE FUNCTION sf_core.apply_identity_decision(
 p_event uuid,p_attempt uuid,p_session uuid,p_workflow uuid,p_version integer,
 p_expected_revision bigint,p_result text
) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE attempt sf_core.identity_attempts%ROWTYPE; prior uuid; n integer;
BEGIN
 IF p_event IS NULL OR p_attempt IS NULL OR p_session IS NULL OR p_workflow IS NULL
 OR p_version IS NULL OR p_version<1 OR p_expected_revision IS NULL OR p_expected_revision<0
 OR p_result IS NULL OR p_result NOT IN ('pending','review','declined','checks_passed') THEN RETURN 'rejected'; END IF;
 SELECT * INTO attempt FROM sf_core.identity_attempts
 WHERE id=p_attempt AND provider_session_id=p_session AND workflow_id=p_workflow
 AND workflow_version=p_version AND environment='sandbox' FOR UPDATE;
 IF NOT FOUND THEN RETURN 'rejected'; END IF;
 SELECT attempt_id INTO prior FROM sf_core.identity_events WHERE event_id=p_event;
 IF FOUND THEN RETURN CASE WHEN prior=p_attempt THEN 'duplicate' ELSE 'rejected' END; END IF;
 IF attempt.state NOT IN ('pending','review') OR attempt.revision<>p_expected_revision THEN RETURN 'stale'; END IF;
 INSERT INTO sf_core.identity_events(event_id,attempt_id) VALUES(p_event,p_attempt) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN
  SELECT attempt_id INTO prior FROM sf_core.identity_events WHERE event_id=p_event;
  RETURN CASE WHEN prior=p_attempt THEN 'duplicate' ELSE 'rejected' END;
 END IF;
 UPDATE sf_core.identity_attempts SET state=p_result,revision=revision+1 WHERE id=p_attempt AND revision=p_expected_revision;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'identity reconciliation conflict'; END IF;
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION sf_core.apply_identity_decision(uuid,uuid,uuid,uuid,integer,bigint,text) FROM PUBLIC;
COMMIT;
