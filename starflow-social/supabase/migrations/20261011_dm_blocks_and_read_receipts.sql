-- Applied to starflow-staging as starflow_dm_blocks_and_read_receipts.
-- Only this testing project was changed; do not auto-apply to main/production.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dm_blocks (
 blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id),
 CONSTRAINT dm_blocks_not_self CHECK(blocker_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS dm_blocks_blocked_idx ON public.dm_blocks(blocked_id);
ALTER TABLE public.dm_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_blocks FROM anon,authenticated;
GRANT SELECT, DELETE ON public.dm_blocks TO authenticated;
GRANT INSERT(blocker_id,blocked_id) ON public.dm_blocks TO authenticated;
DROP POLICY IF EXISTS dm_own_blocks_select ON public.dm_blocks;
CREATE POLICY dm_own_blocks_select ON public.dm_blocks FOR SELECT TO authenticated USING(blocker_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS dm_own_blocks_insert ON public.dm_blocks;
CREATE POLICY dm_own_blocks_insert ON public.dm_blocks FOR INSERT TO authenticated WITH CHECK(blocker_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS dm_own_blocks_delete ON public.dm_blocks;
CREATE POLICY dm_own_blocks_delete ON public.dm_blocks FOR DELETE TO authenticated USING(blocker_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.sf_dm_can_send(p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.dm_conversations dc
  WHERE dc.id=p_conversation AND (dc.user_low=(SELECT auth.uid()) OR dc.user_high=(SELECT auth.uid()))
    AND NOT EXISTS(
      SELECT 1 FROM public.dm_blocks b
      WHERE (b.blocker_id=dc.user_low AND b.blocked_id=dc.user_high)
         OR (b.blocker_id=dc.user_high AND b.blocked_id=dc.user_low)));
$$;
REVOKE ALL ON FUNCTION public.sf_dm_can_send(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_can_send(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_dm_open(p_recipient uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_self uuid:=(SELECT auth.uid());v_id uuid;
BEGIN
 IF v_self IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 IF p_recipient IS NULL OR p_recipient=v_self THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient)
  THEN RAISE EXCEPTION 'Recipient not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.dm_blocks b
   WHERE (b.blocker_id=v_self AND b.blocked_id=p_recipient)
     OR (b.blocker_id=p_recipient AND b.blocked_id=v_self))
  THEN RAISE EXCEPTION 'This conversation is unavailable'; END IF;
 INSERT INTO public.dm_conversations(user_low,user_high)
 VALUES(LEAST(v_self,p_recipient),GREATEST(v_self,p_recipient))
 ON CONFLICT(user_low,user_high) DO NOTHING;
 SELECT id INTO v_id FROM public.dm_conversations
  WHERE user_low=LEAST(v_self,p_recipient) AND user_high=GREATEST(v_self,p_recipient);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sf_dm_open(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_open(uuid) TO authenticated;

DROP POLICY IF EXISTS dm_members_send_messages ON public.dm_messages;
CREATE POLICY dm_members_send_messages ON public.dm_messages
 FOR INSERT TO authenticated WITH CHECK(
  sender_id=(SELECT auth.uid()) AND public.sf_dm_can_send(conversation_id));
DROP POLICY IF EXISTS dm_only_own_read_state ON public.dm_read_state;
DROP POLICY IF EXISTS dm_participants_read_state ON public.dm_read_state;
CREATE POLICY dm_participants_read_state ON public.dm_read_state
 FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.dm_conversations dc WHERE dc.id=conversation_id
    AND(dc.user_low=(SELECT auth.uid()) OR dc.user_high=(SELECT auth.uid()))));
COMMIT;
