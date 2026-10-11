-- Applied to starflow-staging via Supabase migration as
-- starflow_official_notifications_admin_audit. Production is not changed.
BEGIN;
ALTER TABLE public.notifications ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
 'follow','like','repost','reply','mention',
 'verification_approved','verification_rejected','verification_revoked',
 'affiliation_invite','affiliation_accepted','affiliation_activated','affiliation_declined','affiliation_removed',
 'account_warning','account_violation','account_restored','account_security',
 'system_announcement','appeal_result','subscription_activated','subscription_expired'
));
CREATE TABLE IF NOT EXISTS public.official_notification_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE RESTRICT,
 sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS official_notification_audit_sent_idx
 ON public.official_notification_audit(created_at DESC);
ALTER TABLE public.official_notification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.official_notification_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.official_notification_audit TO authenticated;
DROP POLICY IF EXISTS official_notification_audit_admin_read ON public.official_notification_audit;
CREATE POLICY official_notification_audit_admin_read ON public.official_notification_audit
 FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));
CREATE OR REPLACE FUNCTION public.sf_admin_send_notice(p_recipient uuid,p_kind text,p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_admin uuid:=(SELECT auth.uid());v_id uuid;v_message text:=btrim(COALESCE(p_message,''));
BEGIN
 IF v_admin IS NULL OR NOT (SELECT public.is_platform_admin()) THEN
  RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501';
 END IF;
 IF p_kind NOT IN ('system_announcement','account_warning','account_security') THEN
  RAISE EXCEPTION 'Notification category not permitted';
 END IF;
 IF p_recipient IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_recipient) THEN
  RAISE EXCEPTION 'Recipient account not found';
 END IF;
 IF char_length(v_message)<1 OR char_length(v_message)>1000 THEN
  RAISE EXCEPTION 'Notification text must contain 1 to 1000 characters';
 END IF;
 INSERT INTO public.notifications(recipient_id,actor_id,post_id,kind,message)
 VALUES(p_recipient,NULL,NULL,p_kind,v_message) RETURNING id INTO v_id;
 INSERT INTO public.official_notification_audit(notification_id,sent_by,recipient_id,kind)
 VALUES(v_id,v_admin,p_recipient,p_kind);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sf_admin_send_notice(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_send_notice(uuid,text,text) TO authenticated;
REVOKE INSERT,DELETE ON public.notifications FROM anon,authenticated;
REVOKE UPDATE ON public.notifications FROM anon,authenticated;
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
COMMIT;
