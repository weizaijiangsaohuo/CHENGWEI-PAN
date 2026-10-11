-- Applied to starflow-staging as starflow_ai_conversation_history_and_quota.
-- No production database or identity was altered.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_owner_recent_idx ON public.ai_conversations(user_id,updated_at DESC);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_conversations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_conversations TO authenticated;
DROP POLICY IF EXISTS ai_conversations_owner_read ON public.ai_conversations;
CREATE POLICY ai_conversations_owner_read ON public.ai_conversations FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS ai_conversations_owner_insert ON public.ai_conversations;
CREATE POLICY ai_conversations_owner_insert ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS ai_conversations_owner_update ON public.ai_conversations;
CREATE POLICY ai_conversations_owner_update ON public.ai_conversations FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS ai_conversations_owner_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_owner_delete ON public.ai_conversations FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.ai_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')),
 content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 20000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_timeline ON public.ai_messages(conversation_id,created_at DESC,id DESC);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.ai_messages TO authenticated;
DROP POLICY IF EXISTS ai_messages_owner_read ON public.ai_messages;
CREATE POLICY ai_messages_owner_read ON public.ai_messages FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id=conversation_id AND c.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS ai_messages_owner_insert ON public.ai_messages;
CREATE POLICY ai_messages_owner_insert ON public.ai_messages FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id=conversation_id AND c.user_id=(SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.ai_request_limits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 minute_started timestamptz NOT NULL DEFAULT now(),
 minute_requests integer NOT NULL DEFAULT 0,
 day_started date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 day_requests integer NOT NULL DEFAULT 0
);
ALTER TABLE public.ai_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_request_limits FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_ai_request() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=(SELECT auth.uid()); v_minute integer; v_day integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.ai_request_limits(user_id,minute_started,minute_requests,day_started,day_requests)
 VALUES(v_user,now(),1,(now() AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT(user_id) DO UPDATE SET
 minute_requests=CASE WHEN public.ai_request_limits.minute_started<=now()-interval '1 minute' THEN 1 ELSE LEAST(public.ai_request_limits.minute_requests+1,1000000) END,
 minute_started=CASE WHEN public.ai_request_limits.minute_started<=now()-interval '1 minute' THEN now() ELSE public.ai_request_limits.minute_started END,
 day_requests=CASE WHEN public.ai_request_limits.day_started<>(now() AT TIME ZONE 'UTC')::date THEN 1 ELSE LEAST(public.ai_request_limits.day_requests+1,1000000) END,
 day_started=(now() AT TIME ZONE 'UTC')::date
 RETURNING minute_requests,day_requests INTO v_minute,v_day;
 RETURN v_minute<=6 AND v_day<=80;
END $$;
REVOKE ALL ON FUNCTION public.claim_ai_request() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_request() TO authenticated;
COMMIT;
