-- Starflow private voice notes, explicit location sharing, and one-to-one call signaling.
-- Audio objects stay in a PRIVATE bucket. No automatic geolocation collection.
ALTER TABLE public.dm_messages
 ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
 ADD COLUMN IF NOT EXISTS voice_path text,
 ADD COLUMN IF NOT EXISTS voice_seconds integer,
 ADD COLUMN IF NOT EXISTS location_lat double precision,
 ADD COLUMN IF NOT EXISTS location_lng double precision;
DO $block$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sf_dm_message_type_check') THEN
  ALTER TABLE public.dm_messages ADD CONSTRAINT sf_dm_message_type_check
  CHECK (message_type IN ('text','voice','location'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sf_dm_message_payload_check') THEN
  ALTER TABLE public.dm_messages ADD CONSTRAINT sf_dm_message_payload_check CHECK (
   (message_type='text' AND voice_path IS NULL AND location_lat IS NULL AND location_lng IS NULL) OR
   (message_type='voice' AND voice_path IS NOT NULL AND voice_seconds BETWEEN 1 AND 120
    AND location_lat IS NULL AND location_lng IS NULL) OR
   (message_type='location' AND voice_path IS NULL AND voice_seconds IS NULL
    AND location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180)
  );
 END IF;
END $block$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('sf-private-dm-voice','sf-private-dm-voice',false,8388608,
 ARRAY['audio/webm','audio/mp4','audio/ogg','video/webm','video/mp4'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=8388608,
 allowed_mime_types=ARRAY['audio/webm','audio/mp4','audio/ogg','video/webm','video/mp4'];
-- A path is conversation UUID / sender UUID / random UUID . extension.
-- Authenticated sender must belong to the thread; blocked sender cannot upload.
CREATE OR REPLACE FUNCTION public.sf_dm_voice_can_access(p_name text,p_write boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $fn$
 SELECT (SELECT auth.uid()) IS NOT NULL
  AND p_name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|mp4|ogg)$'
  AND EXISTS (
   SELECT 1 FROM public.dm_conversations dc
   WHERE dc.id::text=split_part(p_name,'/',1)
    AND (dc.user_low=(SELECT auth.uid()) OR dc.user_high=(SELECT auth.uid()))
    AND (NOT p_write OR (
      split_part(p_name,'/',2)=(SELECT auth.uid())::text AND
      public.sf_dm_can_send(dc.id)
    ))
  );
 $fn$;
REVOKE ALL ON FUNCTION public.sf_dm_voice_can_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_voice_can_access(text,boolean) TO authenticated;
DROP POLICY IF EXISTS sf_dm_voice_upload ON storage.objects;
CREATE POLICY sf_dm_voice_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='sf-private-dm-voice' AND public.sf_dm_voice_can_access(name,true)
   AND owner_id=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS sf_dm_voice_read ON storage.objects;
CREATE POLICY sf_dm_voice_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='sf-private-dm-voice' AND public.sf_dm_voice_can_access(name,false));
DROP POLICY IF EXISTS sf_dm_voice_remove_own ON storage.objects;
CREATE POLICY sf_dm_voice_remove_own ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='sf-private-dm-voice' AND owner_id=(SELECT auth.uid())::text
  AND public.sf_dm_voice_can_access(name,true));
CREATE OR REPLACE FUNCTION public.sf_dm_send_voice(p_conversation uuid,p_path text,p_seconds integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $fn$
DECLARE result uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT public.sf_dm_can_send(p_conversation) THEN
  RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501'; END IF;
 IF p_seconds NOT BETWEEN 1 AND 120 OR NOT public.sf_dm_voice_can_access(p_path,true)
  OR split_part(p_path,'/',1)<>p_conversation::text
  OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='sf-private-dm-voice'
    AND name=p_path AND owner_id=uid::text)
 THEN RAISE EXCEPTION 'Invalid or missing voice file'; END IF;
 INSERT INTO public.dm_messages(conversation_id,sender_id,body,message_type,voice_path,voice_seconds)
 VALUES(p_conversation,uid,'[语音消息]','voice',p_path,p_seconds) RETURNING id INTO result;
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_dm_send_location(p_conversation uuid,p_lat double precision,p_lng double precision)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $fn$
DECLARE result uuid; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT public.sf_dm_can_send(p_conversation) THEN
  RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501'; END IF;
 IF NOT isfinite(p_lat) OR NOT isfinite(p_lng) OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
 THEN RAISE EXCEPTION 'Invalid coordinates'; END IF;
 INSERT INTO public.dm_messages(conversation_id,sender_id,body,message_type,location_lat,location_lng)
 VALUES(p_conversation,uid,'[位置消息]','location',round(p_lat::numeric,5)::double precision,round(p_lng::numeric,5)::double precision)
 RETURNING id INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_dm_send_voice(uuid,text,integer), public.sf_dm_send_location(uuid,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_send_voice(uuid,text,integer), public.sf_dm_send_location(uuid,double precision,double precision) TO authenticated;
-- Use an explicit signaling table so call setup cannot use public, unauthenticated broadcast channels.
CREATE TABLE IF NOT EXISTS public.sf_dm_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
 caller_id uuid NOT NULL REFERENCES public.profiles(id),
 callee_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','active','ended','declined')),
 created_at timestamptz NOT NULL DEFAULT now(),
 answered_at timestamptz,
 ended_at timestamptz,
 CHECK(caller_id<>callee_id)
);
CREATE INDEX IF NOT EXISTS sf_dm_calls_callee_idx ON public.sf_dm_calls(callee_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS sf_dm_calls_caller_idx ON public.sf_dm_calls(caller_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.sf_dm_call_signals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_id uuid NOT NULL REFERENCES public.sf_dm_calls(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN ('offer','answer','ice')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_dm_signals_call_idx ON public.sf_dm_call_signals(call_id,created_at,id);
ALTER TABLE public.sf_dm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_dm_call_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_dm_calls,public.sf_dm_call_signals FROM anon,authenticated;
GRANT SELECT ON public.sf_dm_calls,public.sf_dm_call_signals TO authenticated;
GRANT INSERT(call_id,sender_id,kind,payload) ON public.sf_dm_call_signals TO authenticated;
DROP POLICY IF EXISTS sf_dm_calls_participant_read ON public.sf_dm_calls;
CREATE POLICY sf_dm_calls_participant_read ON public.sf_dm_calls FOR SELECT TO authenticated
 USING (caller_id=(SELECT auth.uid()) OR callee_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_dm_call_signals_participant_read ON public.sf_dm_call_signals;
CREATE POLICY sf_dm_call_signals_participant_read ON public.sf_dm_call_signals FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.sf_dm_calls c WHERE c.id=call_id
  AND(c.caller_id=(SELECT auth.uid()) OR c.callee_id=(SELECT auth.uid()))));
DROP POLICY IF EXISTS sf_dm_call_signals_participant_write ON public.sf_dm_call_signals;
CREATE POLICY sf_dm_call_signals_participant_write ON public.sf_dm_call_signals FOR INSERT TO authenticated
 WITH CHECK(sender_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.sf_dm_calls c WHERE c.id=call_id AND c.status IN ('ringing','active')
   AND c.created_at>now()-interval '15 minutes'
   AND(c.caller_id=(SELECT auth.uid()) OR c.callee_id=(SELECT auth.uid()))
   AND public.sf_dm_can_send(c.conversation_id)));

CREATE OR REPLACE FUNCTION public.sf_dm_start_call(p_conversation uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $fn$
DECLARE uid uuid:=auth.uid(); peer uuid; call_id uuid;
BEGIN
 IF uid IS NULL OR NOT public.sf_dm_can_send(p_conversation) THEN RAISE EXCEPTION 'Calls unavailable' USING ERRCODE='42501'; END IF;
 SELECT CASE WHEN user_low=uid THEN user_high ELSE user_low END INTO peer
  FROM public.dm_conversations WHERE id=p_conversation AND (user_low=uid OR user_high=uid);
 IF peer IS NULL THEN RAISE EXCEPTION 'No conversation'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_dm_calls WHERE (caller_id=uid OR callee_id=uid)
   AND status IN ('ringing','active') AND created_at>now()-interval '3 minutes')
 THEN RAISE EXCEPTION 'You already have an active or ringing call'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_dm_calls WHERE caller_id=uid
   AND created_at>now()-interval '20 seconds') THEN RAISE EXCEPTION 'Please wait before calling again'; END IF;
 INSERT INTO public.sf_dm_calls(conversation_id,caller_id,callee_id)
 VALUES(p_conversation,uid,peer) RETURNING id INTO call_id;
 RETURN call_id;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_dm_call_action(p_call uuid,p_action text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $fn$
DECLARE item public.sf_dm_calls%ROWTYPE; uid uuid:=auth.uid();
BEGIN
 SELECT * INTO item FROM public.sf_dm_calls WHERE id=p_call FOR UPDATE;
 IF NOT FOUND OR uid IS NULL OR (uid<>item.caller_id AND uid<>item.callee_id)
 THEN RAISE EXCEPTION 'Call not found' USING ERRCODE='42501'; END IF;
 IF p_action='accept' THEN
  IF uid<>item.callee_id OR item.status<>'ringing' OR item.created_at<now()-interval '3 minutes'
     OR NOT public.sf_dm_can_send(item.conversation_id)
  THEN RAISE EXCEPTION 'Call cannot be answered'; END IF;
  UPDATE public.sf_dm_calls SET status='active',answered_at=now() WHERE id=p_call;
 ELSIF p_action='decline' THEN
  IF uid<>item.callee_id OR item.status<>'ringing' THEN RAISE EXCEPTION 'Call cannot be declined'; END IF;
  UPDATE public.sf_dm_calls SET status='declined',ended_at=now() WHERE id=p_call;
 ELSIF p_action='end' THEN
  IF item.status NOT IN ('ringing','active') THEN RETURN true; END IF;
  UPDATE public.sf_dm_calls SET status='ended',ended_at=now() WHERE id=p_call;
 ELSE RAISE EXCEPTION 'Unknown call action'; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_dm_start_call(uuid),public.sf_dm_call_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_dm_start_call(uuid),public.sf_dm_call_action(uuid,text) TO authenticated;
-- Keep Realtime private via table RLS.
DO $block$ DECLARE name text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH name IN ARRAY ARRAY['sf_dm_calls','sf_dm_call_signals'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=name)
   THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',name); END IF;
  END LOOP;
 END IF;
END $block$;