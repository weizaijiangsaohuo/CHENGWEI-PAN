-- SECURITY: Trigger-only functions must never be directly callable by web API roles.
-- Revoke EXECUTE; existing PostgreSQL triggers/event triggers still execute them.
-- Do not alter intentional public RPCs like poll_option_tallies or sf_public_settings.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.send_activity_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_dm_update_conversation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_init_account_ip_country() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_log_handle_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_notify_moderation_decision() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_notify_post_mentions() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_notify_verification_decision() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sf_notify_verification_revoke() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
