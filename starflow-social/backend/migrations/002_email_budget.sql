-- Disposable test / fresh new backend only; never execute against legacy production.
BEGIN;
CREATE TABLE sf_core.email_attempts(
 event_id uuid PRIMARY KEY,
 principal_id uuid NOT NULL REFERENCES sf_core.principals(id),
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX email_attempts_time ON sf_core.email_attempts(reserved_at);
CREATE INDEX email_attempts_actor ON sf_core.email_attempts(principal_id,reserved_at);
ALTER TABLE sf_core.email_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.email_attempts FROM PUBLIC;
-- Only migration owner may test this until a narrowly privileged dispatcher role is reviewed.
CREATE FUNCTION sf_core.reserve_security_mail(p_event uuid,p_actor uuid,p_purpose text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_event IS NULL OR p_actor IS NULL OR p_purpose IS NULL OR p_purpose NOT IN ('verify','reset') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(812631,1);
 IF EXISTS(SELECT 1 FROM sf_core.email_attempts WHERE event_id=p_event) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.principals WHERE id=p_actor) THEN RETURN false; END IF;
 -- Rolling 24h cap deliberately below 300 provider sends; leave 60 for operational safety.
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')>=240 THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE principal_id=p_actor AND reserved_at>clock_timestamp()-interval '1 hour')>=3 THEN RETURN false; END IF;
 INSERT INTO sf_core.email_attempts(event_id,principal_id,purpose) VALUES(p_event,p_actor,p_purpose);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sf_core.reserve_security_mail(uuid,uuid,text) FROM PUBLIC;
COMMIT;
