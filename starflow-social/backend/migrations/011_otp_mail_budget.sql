-- Isolated shared email budget. Recipient_key is a keyed HMAC of canonical email, never raw address.
BEGIN;
CREATE TABLE sf_core.otp_mail_attempts(
 event_id uuid PRIMARY KEY,
 recipient_key text NOT NULL CHECK(recipient_key ~ '^[0-9a-f]{64}$'),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX otp_mail_time ON sf_core.otp_mail_attempts(reserved_at);
CREATE INDEX otp_mail_recipient ON sf_core.otp_mail_attempts(recipient_key,reserved_at);
ALTER TABLE sf_core.otp_mail_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.otp_mail_attempts FROM PUBLIC;
CREATE OR REPLACE FUNCTION sf_core.reserve_security_mail(p_event uuid,p_actor uuid,p_purpose text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_event IS NULL OR p_actor IS NULL OR p_purpose IS NULL OR p_purpose NOT IN ('verify','reset') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(812631,1);
 IF EXISTS(SELECT 1 FROM sf_core.email_attempts WHERE event_id=p_event) OR EXISTS(SELECT 1 FROM sf_core.otp_mail_attempts WHERE event_id=p_event) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM sf_core.principals WHERE id=p_actor) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')+(SELECT count(*) FROM sf_core.otp_mail_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')>=240 THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE principal_id=p_actor AND reserved_at>clock_timestamp()-interval '1 hour')>=3 THEN RETURN false; END IF;
 INSERT INTO sf_core.email_attempts(event_id,principal_id,purpose) VALUES(p_event,p_actor,p_purpose);
 RETURN true;
END $$;
CREATE FUNCTION sf_core.reserve_otp_mail(p_event uuid,p_recipient_key text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_event IS NULL OR p_recipient_key IS NULL OR p_recipient_key !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(812631,1);
 IF EXISTS(SELECT 1 FROM sf_core.otp_mail_attempts WHERE event_id=p_event) OR EXISTS(SELECT 1 FROM sf_core.email_attempts WHERE event_id=p_event) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')+(SELECT count(*) FROM sf_core.otp_mail_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')>=240 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.otp_mail_attempts WHERE recipient_key=p_recipient_key AND reserved_at>clock_timestamp()-interval '60 seconds') THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.otp_mail_attempts WHERE recipient_key=p_recipient_key AND reserved_at>clock_timestamp()-interval '1 hour')>=3 THEN RETURN false; END IF;
 INSERT INTO sf_core.otp_mail_attempts(event_id,recipient_key) VALUES(p_event,p_recipient_key);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sf_core.reserve_otp_mail(uuid,text) FROM PUBLIC;
COMMIT;
