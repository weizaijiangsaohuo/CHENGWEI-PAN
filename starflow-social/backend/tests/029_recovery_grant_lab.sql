\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 t timestamptz:=clock_timestamp(); k bytea:=sha256(convert_to(gen_random_uuid()::text,'UTF8'));
 l bytea:=sha256(convert_to(gen_random_uuid()::text,'UTF8'));
 m bytea:=sha256(convert_to(gen_random_uuid()::text,'UTF8'));
BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES(s,'Grant fixture','grant-lab-fixture@example.invalid',true,t,t,false);
 INSERT INTO sf_core.principals(id) VALUES(p);
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(p,s);
 INSERT INTO sf_core.account_recovery_policy(principal_id,enabled) VALUES(p,true);
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at,consumed_at)
 VALUES(s,t-interval '1 minute',t+interval '10 minutes',t);
 IF sf_core.issue_recovery_grant_lab(a,s,sha256(k)) THEN RAISE EXCEPTION 'missing claim'; END IF;
 IF NOT sf_core.claim_recovery_replay_lab(a,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,t+interval '10 minutes')
 OR NOT sf_core.claim_recovery_replay_lab(b,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,t+interval '3 minutes')
 OR NOT sf_core.claim_recovery_replay_lab(c,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,t+interval '3 minutes')
 THEN RAISE EXCEPTION 'fixture claims failed'; END IF;
 IF sf_core.issue_recovery_grant_lab(a,gen_random_uuid(),sha256(k)) OR sf_core.issue_recovery_grant_lab(a,s,decode('00','hex'))
 THEN RAISE EXCEPTION 'invalid issue'; END IF;
 IF NOT sf_core.issue_recovery_grant_lab(a,s,sha256(k)) THEN RAISE EXCEPTION 'issue failed'; END IF;
 IF sf_core.issue_recovery_grant_lab(a,s,sha256(l)) OR sf_core.issue_recovery_grant_lab(b,s,sha256(k))
 THEN RAISE EXCEPTION 'duplicate issue'; END IF;
 IF sf_core.consume_recovery_grant_lab(a,s,l) OR sf_core.consume_recovery_grant_lab(a,gen_random_uuid(),k)
 THEN RAISE EXCEPTION 'wrong credential accepted'; END IF;
 UPDATE public."user" SET "twoFactorEnabled"=true WHERE id=s;
 IF sf_core.consume_recovery_grant_lab(a,s,k) THEN RAISE EXCEPTION 'MFA bypass'; END IF;
 UPDATE public."user" SET "twoFactorEnabled"=false WHERE id=s;
 UPDATE sf_core.account_recovery_policy SET enabled=false WHERE principal_id=p;
 IF sf_core.consume_recovery_grant_lab(a,s,k) THEN RAISE EXCEPTION 'withdrawn policy accepted'; END IF;
 UPDATE sf_core.account_recovery_policy SET enabled=true WHERE principal_id=p;
 IF NOT sf_core.consume_recovery_grant_lab(a,s,k) THEN RAISE EXCEPTION 'consume failed'; END IF;
 IF sf_core.consume_recovery_grant_lab(a,s,k) OR sf_core.revoke_recovery_grant_lab(a,s)
 THEN RAISE EXCEPTION 'consumed grant reused'; END IF;
 IF NOT sf_core.issue_recovery_grant_lab(b,s,sha256(l)) THEN RAISE EXCEPTION 'second issue failed'; END IF;
 IF sf_core.revoke_recovery_grant_lab(b,gen_random_uuid()) THEN RAISE EXCEPTION 'cross account revoked'; END IF;
 IF NOT sf_core.revoke_recovery_grant_lab(b,s) THEN RAISE EXCEPTION 'revoke failed'; END IF;
 IF sf_core.consume_recovery_grant_lab(b,s,l) OR sf_core.issue_recovery_grant_lab(b,s,sha256(m))
 THEN RAISE EXCEPTION 'revoked grant reused'; END IF;
 IF NOT sf_core.issue_recovery_grant_lab(c,s,sha256(m)) THEN RAISE EXCEPTION 'third issue failed'; END IF;
 UPDATE sf_core.recovery_grant_lab SET issued_at=t-interval '2 minutes',expires_at=t-interval '1 minute' WHERE attempt_id=c;
 IF sf_core.consume_recovery_grant_lab(c,s,m) THEN RAISE EXCEPTION 'expired grant accepted'; END IF;
 IF EXISTS(SELECT 1 FROM sf_core.recovery_grant_lab g JOIN sf_core.recovery_replay_lab r USING(attempt_id) WHERE r.subject=s AND (g.expires_at>r.expires_at OR g.expires_at>g.issued_at+interval '5 minutes'))
 THEN RAISE EXCEPTION 'TTL invariant broken'; END IF;
 IF has_function_privilege('sf_account_recovery_gateway','sf_core.issue_recovery_grant_lab(uuid,uuid,bytea)','EXECUTE')
 OR has_function_privilege('sf_account_recovery_gateway','sf_core.consume_recovery_grant_lab(uuid,uuid,bytea)','EXECUTE')
 OR has_function_privilege('sf_profile_runtime','sf_core.consume_recovery_grant_lab(uuid,uuid,bytea)','EXECUTE')
 OR has_function_privilege('sf_account_recovery_gateway','sf_core.revoke_recovery_grant_lab(uuid,uuid)','EXECUTE')
 OR has_table_privilege('sf_account_recovery_gateway','sf_core.recovery_grant_lab','SELECT')
 THEN RAISE EXCEPTION 'grant lab leaked'; END IF;
END $$;
ROLLBACK;
