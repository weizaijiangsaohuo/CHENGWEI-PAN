-- Staging only. Already applied via Supabase apply_migration under
-- starflow_staging_p0_private_direct_messages. Do not run against production without review.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  last_sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT dm_canonical_pair CHECK (user_low < user_high),
  CONSTRAINT dm_unique_pair UNIQUE (user_low, user_high)
);
CREATE INDEX IF NOT EXISTS dm_conversations_low_idx
  ON public.dm_conversations(user_low, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS dm_conversations_high_idx
  ON public.dm_conversations(user_high, last_message_at DESC NULLS LAST);
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_conversations FROM anon, authenticated;
GRANT SELECT ON public.dm_conversations TO authenticated;
DROP POLICY IF EXISTS dm_participants_read_conversations ON public.dm_conversations;
CREATE POLICY dm_participants_read_conversations ON public.dm_conversations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_low OR (SELECT auth.uid()) = user_high);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_messages_history_idx
  ON public.dm_messages(conversation_id, created_at DESC, id DESC);
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_messages FROM anon, authenticated;
GRANT SELECT ON public.dm_messages TO authenticated;
GRANT INSERT (conversation_id, sender_id, body) ON public.dm_messages TO authenticated;
DROP POLICY IF EXISTS dm_members_read_messages ON public.dm_messages;
CREATE POLICY dm_members_read_messages ON public.dm_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.dm_conversations dc WHERE dc.id = conversation_id
      AND ((SELECT auth.uid()) = dc.user_low OR (SELECT auth.uid()) = dc.user_high)
  ));
DROP POLICY IF EXISTS dm_members_send_messages ON public.dm_messages;
CREATE POLICY dm_members_send_messages ON public.dm_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.dm_conversations dc WHERE dc.id = conversation_id
        AND ((SELECT auth.uid()) = dc.user_low OR (SELECT auth.uid()) = dc.user_high)
    )
  );

CREATE TABLE IF NOT EXISTS public.dm_read_state (
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id,user_id)
);
ALTER TABLE public.dm_read_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_read_state FROM anon, authenticated;
GRANT SELECT ON public.dm_read_state TO authenticated;
DROP POLICY IF EXISTS dm_only_own_read_state ON public.dm_read_state;
CREATE POLICY dm_only_own_read_state ON public.dm_read_state FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.dm_conversations dc WHERE dc.id=conversation_id
      AND ((SELECT auth.uid())=dc.user_low OR (SELECT auth.uid())=dc.user_high)
  )
);
CREATE OR REPLACE FUNCTION public.sf_dm_open(p_recipient uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_self uuid := (SELECT auth.uid()); v_id uuid;
BEGIN
 IF v_self IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 IF p_recipient IS NULL OR p_recipient=v_self THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient)
   THEN RAISE EXCEPTION 'Recipient not found'; END IF;
 INSERT INTO public.dm_conversations(user_low,user_high)
 VALUES(LEAST(v_self,p_recipient),GREATEST(v_self,p_recipient))
 ON CONFLICT (user_low,user_high) DO NOTHING;
 SELECT id INTO v_id FROM public.dm_conversations
 WHERE user_low=LEAST(v_self,p_recipient) AND user_high=GREATEST(v_self,p_recipient);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sf_dm_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_open(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sf_dm_mark_read(p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_self uuid := (SELECT auth.uid());
BEGIN
 IF v_self IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.dm_conversations dc WHERE dc.id=p_conversation
  AND (dc.user_low=v_self OR dc.user_high=v_self)
 ) THEN RAISE EXCEPTION 'Conversation access denied'; END IF;
 INSERT INTO public.dm_read_state(conversation_id,user_id,last_read_at)
 VALUES (p_conversation,v_self,now())
 ON CONFLICT (conversation_id,user_id) DO UPDATE
 SET last_read_at=GREATEST(public.dm_read_state.last_read_at,EXCLUDED.last_read_at);
END $$;
REVOKE ALL ON FUNCTION public.sf_dm_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_mark_read(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sf_dm_update_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.dm_conversations SET last_message_at=NEW.created_at,last_sender_id=NEW.sender_id
 WHERE id=NEW.conversation_id AND (last_message_at IS NULL OR last_message_at <= NEW.created_at);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sf_dm_message_posted ON public.dm_messages;
CREATE TRIGGER sf_dm_message_posted AFTER INSERT ON public.dm_messages
 FOR EACH ROW EXECUTE FUNCTION public.sf_dm_update_conversation();
COMMIT;
