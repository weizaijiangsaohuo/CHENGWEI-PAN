-- Only installed internal trigger/event-trigger functions are protected.
-- Different environments may have different historical trigger sets.
-- Function signatures and public business RPCs are left unchanged.
DO $security$
DECLARE function_name text;
BEGIN
 FOREACH function_name IN ARRAY ARRAY['handle_new_user','send_activity_notification','sf_dm_update_conversation','sf_init_account_ip_country','sf_log_handle_change','sf_notify_moderation_decision','sf_notify_post_mentions','sf_notify_verification_decision','sf_notify_verification_revoke','rls_auto_enable'] LOOP
  IF to_regprocedure(format('public.%I()',function_name)) IS NOT NULL THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC,anon,authenticated',function_name);
  END IF;
 END LOOP;
END $security$;
