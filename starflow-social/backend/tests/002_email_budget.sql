\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sf_core.principals(id) VALUES ('11111111-1111-4111-8111-111111111111');
DO $$ DECLARE a uuid:='11111111-1111-4111-8111-111111111111';e uuid:=gen_random_uuid(); BEGIN
 IF NOT sf_core.reserve_security_mail(e,a,'verify') THEN RAISE EXCEPTION 'first reservation failed'; END IF;
 IF sf_core.reserve_security_mail(e,a,'reset') THEN RAISE EXCEPTION 'duplicate accepted'; END IF;
 IF NOT sf_core.reserve_security_mail(gen_random_uuid(),a,'reset') OR NOT sf_core.reserve_security_mail(gen_random_uuid(),a,'verify') THEN RAISE EXCEPTION 'valid reservations failed'; END IF;
 IF sf_core.reserve_security_mail(gen_random_uuid(),a,'verify') THEN RAISE EXCEPTION 'per-user cap bypass'; END IF;
 IF sf_core.reserve_security_mail(gen_random_uuid(),a,'marketing') THEN RAISE EXCEPTION 'arbitrary purpose'; END IF;
 UPDATE sf_core.email_attempts SET reserved_at=clock_timestamp()-interval '2 hours';
 INSERT INTO sf_core.email_attempts(event_id,principal_id,purpose,reserved_at) SELECT gen_random_uuid(),a,'verify',clock_timestamp()-interval '2 hours' FROM generate_series(1,237);
 IF sf_core.reserve_security_mail(gen_random_uuid(),a,'verify') THEN RAISE EXCEPTION 'global quota bypass'; END IF;
END $$;
SET LOCAL ROLE sf_profile_runtime;
DO $$ BEGIN
 BEGIN PERFORM sf_core.reserve_security_mail(gen_random_uuid(),gen_random_uuid(),'verify'); RAISE EXCEPTION 'runtime may reserve';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
