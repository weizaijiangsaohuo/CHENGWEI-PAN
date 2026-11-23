\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES('11111111-1111-4111-8111-111111111111');
DO $$ DECLARE e uuid:=gen_random_uuid();k text:=repeat('a',64);a uuid:='11111111-1111-4111-8111-111111111111';BEGIN
 IF NOT sf_core.reserve_otp_mail(e,k) OR sf_core.reserve_otp_mail(e,k) OR sf_core.reserve_security_mail(e,a,'verify') THEN RAISE EXCEPTION 'event deduplication'; END IF;
 IF sf_core.reserve_otp_mail(gen_random_uuid(),k) THEN RAISE EXCEPTION 'cooldown bypass'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes';
 IF NOT sf_core.reserve_otp_mail(gen_random_uuid(),k) THEN RAISE EXCEPTION 'valid resend rejected'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes';
 IF NOT sf_core.reserve_otp_mail(gen_random_uuid(),k) THEN RAISE EXCEPTION 'third send rejected'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes';
 IF sf_core.reserve_otp_mail(gen_random_uuid(),k) THEN RAISE EXCEPTION 'hourly cap bypass'; END IF;
 INSERT INTO sf_core.email_attempts(event_id,principal_id,purpose,reserved_at) SELECT gen_random_uuid(),a,'verify',clock_timestamp()-interval '2 hours' FROM generate_series(1,237);
 IF sf_core.reserve_otp_mail(gen_random_uuid(),repeat('b',64)) OR sf_core.reserve_security_mail(gen_random_uuid(),a,'reset') THEN RAISE EXCEPTION 'shared global cap bypass'; END IF;
END $$;
ROLLBACK;
