-- Read-only checks for the provisioned but still NOLOGIN staging configuration.
-- Never use the database owner or a privileged console-created role as app credentials.
DO $$
DECLARE t text; r text; n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_roles WHERE rolname IN
 ('sf_auth_runtime','sf_business_connect','sf_profile_runtime','sf_session_gateway','sf_review_gateway')
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
 AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit;
 IF n<>5 THEN RAISE EXCEPTION 'restricted roles not safe'; END IF;
 IF NOT pg_has_role('sf_business_connect','sf_session_gateway','SET')
 OR NOT pg_has_role('sf_business_connect','sf_profile_runtime','SET')
 OR pg_has_role('sf_business_connect','sf_profile_runtime','USAGE')
 OR pg_has_role('sf_business_connect','sf_review_gateway','MEMBER')
 OR pg_has_role('sf_business_connect','sf_auth_runtime','MEMBER')
 THEN RAISE EXCEPTION 'business role membership mismatch'; END IF;
 IF EXISTS(
 SELECT 1 FROM pg_auth_members m JOIN pg_roles gr ON gr.oid=m.roleid
 JOIN pg_roles mr ON mr.oid=m.member WHERE mr.rolname IN
 ('sf_auth_runtime','sf_business_connect','sf_profile_runtime','sf_session_gateway','sf_review_gateway')
 AND NOT ((mr.rolname='sf_business_connect' AND gr.rolname='sf_session_gateway'
 OR mr.rolname='sf_session_gateway' AND gr.rolname='sf_profile_runtime')
 AND m.set_option AND NOT m.admin_option AND NOT m.inherit_option)
 ) THEN RAISE EXCEPTION 'unexpected role membership'; END IF;
 FOREACH t IN ARRAY ARRAY['user','session','account','verification','twoFactor','passkey','rateLimit'] LOOP
  IF NOT (has_table_privilege('sf_auth_runtime',format('public.%I',t),'SELECT')
  AND has_table_privilege('sf_auth_runtime',format('public.%I',t),'INSERT')
  AND has_table_privilege('sf_auth_runtime',format('public.%I',t),'UPDATE')
  AND has_table_privilege('sf_auth_runtime',format('public.%I',t),'DELETE'))
  THEN RAISE EXCEPTION 'auth runtime permission missing: %',t; END IF;
  FOREACH r IN ARRAY ARRAY['sf_profile_runtime','sf_business_connect','sf_session_gateway','sf_review_gateway'] LOOP
   IF has_table_privilege(r,format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(r,format('public.%I',t),'SELECT,INSERT,UPDATE,REFERENCES')
   THEN RAISE EXCEPTION 'auth table privilege leaked: % %',r,t; END IF;
  END LOOP;
 END LOOP;
 IF has_schema_privilege('sf_auth_runtime','public','CREATE')
 OR has_schema_privilege('sf_business_connect','public','CREATE')
 OR has_schema_privilege('sf_auth_runtime','sf_core','USAGE')
 OR has_table_privilege('sf_auth_runtime','sf_core.profiles','SELECT,INSERT,UPDATE,DELETE')
 OR has_function_privilege('sf_profile_runtime','sf_core.open_review_queue(uuid,uuid,uuid,integer)','EXECUTE')
 OR has_function_privilege('sf_business_connect','sf_core.open_review_queue(uuid,uuid,uuid,integer)','EXECUTE')
 OR NOT has_function_privilege('sf_review_gateway','sf_core.open_review_queue(uuid,uuid,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'schema or review isolation mismatch'; END IF;
 RAISE NOTICE 'PASS: restricted backend roles';
END $$;
