-- Make new private messages discoverable through in-app notifications.
-- Notification contains NO message body; private content remains under DM RLS.
BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
CHECK (kind IN (
 'follow','like','repost','reply','mention','direct_message',
 'verification_approved','verification_rejected','verification_revoked',
 'affiliation_invite','affiliation_accepted','affiliation_activated','affiliation_declined','affiliation_removed',
 'account_warning','account_violation','account_restored','account_security',
 'system_announcement','appeal_result','subscription_activated','subscription_expired'
));

CREATE OR REPLACE FUNCTION public.sf_notify_direct_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient uuid;
BEGIN
  SELECT CASE
    WHEN NEW.sender_id = dc.user_low THEN dc.user_high
    WHEN NEW.sender_id = dc.user_high THEN dc.user_low
    ELSE NULL
  END INTO recipient
  FROM public.dm_conversations dc
  WHERE dc.id = NEW.conversation_id;

  IF recipient IS NOT NULL AND recipient <> NEW.sender_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, post_id, kind, message)
    VALUES (recipient, NEW.sender_id, NULL, 'direct_message', NULL);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sf_notify_direct_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sf_notify_new_direct_message ON public.dm_messages;
CREATE TRIGGER sf_notify_new_direct_message
 AFTER INSERT ON public.dm_messages
 FOR EACH ROW EXECUTE FUNCTION public.sf_notify_direct_message();
COMMIT;
