\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE k text:=repeat('a',64); e uuid:=gen_random_uuid(); n integer;
BEGIN
 IF sf_core.reserve_recipient_mail(e,k,'verify') IS DISTINCT FROM true THEN RAISE EXCEPTION 'verify denied'; END IF;
 IF sf_core.reserve_recipient_mail(e,repeat('b',64),'reset') IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate event'; END IF;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),k,'otp') IS DISTINCT FROM false THEN RAISE EXCEPTION 'cross-purpose cooldown'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes' WHERE event_id=e;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),k,'reset') IS DISTINCT FROM true THEN RAISE EXCEPTION 'reset denied'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes' WHERE recipient_key=k;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),k,'otp') IS DISTINCT FROM true THEN RAISE EXCEPTION 'OTP denied'; END IF;
 UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes' WHERE recipient_key=k;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),k,'verify') IS DISTINCT FROM false THEN RAISE EXCEPTION 'shared recipient quota exceeded'; END IF;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),repeat('b',64),'marketing') IS DISTINCT FROM false THEN RAISE EXCEPTION 'unsupported purpose'; END IF;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),'raw@example.invalid','otp') IS DISTINCT FROM false THEN RAISE EXCEPTION 'raw email allowed'; END IF;
 FOR n IN 1..237 LOOP
  IF sf_core.reserve_recipient_mail(gen_random_uuid(),lpad(to_hex(n),64,'0'),'verify') IS DISTINCT FROM true THEN RAISE EXCEPTION 'unexpected budget denial'; END IF;
 END LOOP;
 IF sf_core.reserve_recipient_mail(gen_random_uuid(),repeat('f',64),'otp') IS DISTINCT FROM false THEN RAISE EXCEPTION 'global budget exceeded';END IF;
END $$;
SET LOCAL ROLE sf_mail_budget_gateway;
DO $$ BEGIN
 BEGIN PERFORM * FROM sf_core.otp_mail_attempts;RAISE EXCEPTION 'direct budget read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM sf_core.identity_evidence;RAISE EXCEPTION 'vault exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.reserve_recipient_mail(gen_random_uuid(),repeat('a',64),'otp');RAISE EXCEPTION 'ordinary mail reservation';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
