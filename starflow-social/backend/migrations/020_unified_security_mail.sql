-- One free-only recipient-based budget for all future security mail.
-- No email addresses, tokens, codes, live credentials or delivery side effects.
BEGIN;
CREATE ROLE sf_mail_budget_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT USAGE ON SCHEMA sf_core TO sf_mail_budget_gateway;
ALTER TABLE sf_core.otp_mail_attempts ADD COLUMN purpose text NOT NULL DEFAULT 'otp' CHECK(purpose IN ('otp','verify','reset'));
CREATE FUNCTION sf_core.reserve_recipient_mail(p_event uuid,p_recipient_key text,p_purpose text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_event IS NULL OR p_recipient_key IS NULL OR p_recipient_key !~ '^[0-9a-f]{64}$'
 OR p_purpose IS NULL OR p_purpose NOT IN ('otp','verify','reset') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(812631,1);
 IF EXISTS(SELECT 1 FROM sf_core.email_attempts WHERE event_id=p_event)
 OR EXISTS(SELECT 1 FROM sf_core.otp_mail_attempts WHERE event_id=p_event) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.email_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')
 +(SELECT count(*) FROM sf_core.otp_mail_attempts WHERE reserved_at>clock_timestamp()-interval '24 hours')>=240 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.otp_mail_attempts WHERE recipient_key=p_recipient_key AND reserved_at>clock_timestamp()-interval '60 seconds') THEN RETURN false; END IF;
 IF (SELECT count(*) FROM sf_core.otp_mail_attempts WHERE recipient_key=p_recipient_key AND reserved_at>clock_timestamp()-interval '1 hour')>=3 THEN RETURN false; END IF;
 INSERT INTO sf_core.otp_mail_attempts(event_id,recipient_key,purpose) VALUES(p_event,p_recipient_key,p_purpose);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sf_core.reserve_recipient_mail(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.reserve_recipient_mail(uuid,text,text) TO sf_mail_budget_gateway;
COMMIT;
