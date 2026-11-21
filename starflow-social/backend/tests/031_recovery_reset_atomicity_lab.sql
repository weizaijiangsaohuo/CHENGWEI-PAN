-- Rollback-only rehearsal using synthetic credentials. No reset function or runtime grant.
BEGIN;
DO $$
DECLARE s uuid:=gen_random_uuid(); other_s uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); t timestamptz:=clock_timestamp(); k bytea:=sha256(convert_to(gen_random_uuid()::text,'UTF8'));
 old_hash text:='synthetic-old-hash-not-a-login-credential';
 new_hash text:='synthetic-new-hash-not-a-login-credential';
 n bigint;
BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified",username,"updatedAt","twoFactorEnabled") VALUES
 (s,'Reset fixture','reset031@example.invalid','true','reset031',t,false),
 (other_s,'Other fixture','other031@example.invalid','true','other031',t,false);
 INSERT INTO public."account"(id,"accountId","providerId","userId",password,"updatedAt") VALUES
 (gen_random_uuid(),s::text,'credential',s,old_hash,t),
 (gen_random_uuid(),other_s::text,'credential',other_s,old_hash,t);
 INSERT INTO public."session"(id,"userId",token,"expiresAt","updatedAt") VALUES
 (gen_random_uuid(),s,'fixture031-a',t+interval '1 hour',t),
 (gen_random_uuid(),s,'fixture031-b',t+interval '1 hour',t),
 (gen_random_uuid(),other_s,'fixture031-other',t+interval '1 hour',t);
 INSERT INTO sf_core.principals(id) VALUES(p);
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(p,s);
 INSERT INTO sf_core.account_recovery_policy(principal_id,enabled) VALUES(p,true);
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at,consumed_at)
 VALUES(s,t-interval '1 minute',t+interval '10 minutes',t);
 IF NOT sf_core.claim_recovery_replay_lab(a,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,t+interval '5 minutes') OR
 NOT sf_core.issue_recovery_grant_lab(a,s,sha256(k)) THEN RAISE EXCEPTION 'fixture grant failed'; END IF;
 -- A different account may neither consume this grant nor affect these credentials.
 IF sf_core.consume_recovery_grant_lab(a,other_s,k) THEN RAISE EXCEPTION 'cross-account grant accepted'; END IF;
 -- Rehearse a fault after all three writes. The subtransaction must undo each.
 BEGIN
  IF NOT sf_core.consume_recovery_grant_lab(a,s,k) THEN RAISE EXCEPTION 'grant rejected'; END IF;
  UPDATE public."account" SET password=new_hash,"updatedAt"=clock_timestamp() WHERE "userId"=s AND "providerId"='credential';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'credential cardinality'; END IF;
  DELETE FROM public."session" WHERE "userId"=s;
  RAISE EXCEPTION USING ERRCODE='SF031',MESSAGE='synthetic rollback after writes';
 EXCEPTION WHEN SQLSTATE 'SF031' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM sf_core.recovery_grant_lab WHERE attempt_id=a AND consumed_at IS NOT NULL)
 OR (SELECT count(*) FROM public."account" WHERE "userId"=s AND password=old_hash)<>1
 OR (SELECT count(*) FROM public."session" WHERE "userId"=s)<>2 THEN RAISE EXCEPTION 'partial reset was not rolled back'; END IF;
 -- Rehearse the successful path in this disposable outer transaction only.
 IF NOT sf_core.consume_recovery_grant_lab(a,s,k) THEN RAISE EXCEPTION 'grant not reusable after rollback'; END IF;
 UPDATE public."account" SET password=new_hash,"updatedAt"=clock_timestamp() WHERE "userId"=s AND "providerId"='credential';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'credential cardinality'; END IF;
 DELETE FROM public."session" WHERE "userId"=s;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>2 THEN RAISE EXCEPTION 'session count mismatch'; END IF;
 IF sf_core.consume_recovery_grant_lab(a,s,k)
 OR EXISTS(SELECT 1 FROM public."session" WHERE "userId"=s)
 OR (SELECT count(*) FROM public."account" WHERE "userId"=s AND password=new_hash)<>1
 OR (SELECT count(*) FROM public."account" WHERE "userId"=other_s AND password=old_hash)<>1
 OR (SELECT count(*) FROM public."session" WHERE "userId"=other_s)<>1
 THEN RAISE EXCEPTION 'reset isolation or single-use invariant failed'; END IF;
END $$;
ROLLBACK;
