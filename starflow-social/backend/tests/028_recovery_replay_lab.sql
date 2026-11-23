\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 f uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
 t timestamptz:=clock_timestamp(); e timestamptz:=t+interval '4 minutes';
BEGIN
 INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES(s,'Replay fixture','replay-lab-fixture@example.invalid',true,t,t,false);
 INSERT INTO sf_core.principals(id) VALUES(p);
 INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES(p,s);
 INSERT INTO sf_core.account_recovery_policy(principal_id,enabled) VALUES(p,true);
 IF sf_core.claim_recovery_replay_lab(a,f,o,v,s,e) THEN RAISE EXCEPTION 'legacy claim'; END IF;
 INSERT INTO sf_core.fresh_registration_admissions(auth_subject,issued_at,expires_at,consumed_at)
 VALUES(s,t-interval '1 minute',t+interval '10 minutes',t);
 IF sf_core.claim_recovery_replay_lab(a,f,o,v,s,t-interval '1 second') OR
    sf_core.claim_recovery_replay_lab(a,f,o,v,s,t+interval '16 minutes') OR
    sf_core.claim_recovery_replay_lab(a,f,o,v,NULL,e) OR
    sf_core.claim_recovery_replay_lab(a,f,o,v,gen_random_uuid(),e) THEN RAISE EXCEPTION 'invalid claim'; END IF;
 IF NOT sf_core.claim_recovery_replay_lab(a,f,o,v,s,e) THEN RAISE EXCEPTION 'first claim denied'; END IF;
 IF sf_core.claim_recovery_replay_lab(a,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,e)
 OR sf_core.claim_recovery_replay_lab(gen_random_uuid(),f,gen_random_uuid(),gen_random_uuid(),s,e)
 OR sf_core.claim_recovery_replay_lab(gen_random_uuid(),gen_random_uuid(),o,gen_random_uuid(),s,e)
 OR sf_core.claim_recovery_replay_lab(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),v,s,e)
 THEN RAISE EXCEPTION 'replay accepted'; END IF;
 UPDATE sf_core.account_recovery_policy SET enabled=false WHERE principal_id=p;
 IF sf_core.claim_recovery_replay_lab(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),s,e)
 THEN RAISE EXCEPTION 'revoked claim accepted'; END IF;
 IF (SELECT count(*) FROM sf_core.recovery_replay_lab WHERE subject=s)<>1 THEN RAISE EXCEPTION 'unexpected claim count'; END IF;
 IF has_function_privilege('sf_account_recovery_gateway','sf_core.claim_recovery_replay_lab(uuid,uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
 OR has_function_privilege('sf_profile_runtime','sf_core.claim_recovery_replay_lab(uuid,uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
 OR has_table_privilege('sf_account_recovery_gateway','sf_core.recovery_replay_lab','INSERT')
 OR has_table_privilege('sf_account_recovery_gateway','sf_core.recovery_replay_lab','SELECT') THEN RAISE EXCEPTION 'sandbox privilege leak'; END IF;
END $$;
ROLLBACK;
