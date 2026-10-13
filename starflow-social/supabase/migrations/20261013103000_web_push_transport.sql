-- Starflow private Web Push subscriptions and generic-notification delivery queue.
-- Transport stays INACTIVE without separately installed VAPID and dispatch secrets.
CREATE TABLE IF NOT EXISTS public.sf_web_push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE CHECK(char_length(endpoint) BETWEEN 35 AND 2048),
 p256dh text NOT NULL CHECK(char_length(p256dh) BETWEEN 60 AND 180),
 auth_secret text NOT NULL CHECK(char_length(auth_secret) BETWEEN 15 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_web_push_owner_idx ON public.sf_web_push_subscriptions(user_id);
ALTER TABLE public.sf_web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_web_push_subscriptions FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.sf_web_push_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.sf_web_push_subscriptions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','leased','sent','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 last_http_status integer,
 UNIQUE(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS sf_web_push_due_idx ON public.sf_web_push_deliveries(next_attempt_at,created_at) WHERE status IN('queued','leased');
ALTER TABLE public.sf_web_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_web_push_deliveries FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sf_register_web_push(p_endpoint text,p_p256dh text,p_auth text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
DECLARE uid uuid:=(SELECT auth.uid()); sub_count integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 -- Prevent use of the delivery transport as a generic SSRF proxy.
 IF p_endpoint IS NULL OR char_length(p_endpoint) NOT BETWEEN 35 AND 2048 OR
  p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com|android[.]googleapis[.]com)/[^[:space:]]+$' THEN
  RAISE EXCEPTION 'Unsupported push gateway URL'; END IF;
 IF p_p256dh IS NULL OR char_length(p_p256dh) NOT BETWEEN 60 AND 180 OR p_p256dh !~ '^[A-Za-z0-9_-]+$'
 OR p_auth IS NULL OR char_length(p_auth) NOT BETWEEN 15 AND 100 OR p_auth !~ '^[A-Za-z0-9_-]+$' THEN
  RAISE EXCEPTION 'Invalid subscription keys'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,993));
 IF EXISTS(SELECT 1 FROM public.sf_web_push_subscriptions WHERE endpoint=p_endpoint AND user_id<>uid) THEN
  RAISE EXCEPTION 'This device subscription belongs to another account'; END IF;
 SELECT count(*) INTO sub_count FROM public.sf_web_push_subscriptions WHERE user_id=uid AND endpoint<>p_endpoint;
 IF sub_count>=6 THEN RAISE EXCEPTION 'Maximum 6 devices per account'; END IF;
 INSERT INTO public.sf_web_push_subscriptions(user_id,endpoint,p256dh,auth_secret)
 VALUES(uid,p_endpoint,p_p256dh,p_auth)
 ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,updated_at=now()
 WHERE public.sf_web_push_subscriptions.user_id=uid;
 RETURN true;
END $push$;
REVOKE ALL ON FUNCTION public.sf_register_web_push(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_register_web_push(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_unsubscribe_web_push(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
DECLARE uid uuid:=(SELECT auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.sf_web_push_subscriptions WHERE user_id=uid AND endpoint=p_endpoint;
 RETURN FOUND;
END $push$;
REVOKE ALL ON FUNCTION public.sf_unsubscribe_web_push(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_unsubscribe_web_push(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_web_push_subscription_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $push$
 SELECT count(*)::integer FROM public.sf_web_push_subscriptions WHERE user_id=(SELECT auth.uid());
$push$;
REVOKE ALL ON FUNCTION public.sf_web_push_subscription_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_web_push_subscription_count() TO authenticated;

-- Database notification triggers emit only IDs, never confidential notification text.
CREATE OR REPLACE FUNCTION public.sf_queue_web_push_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
BEGIN
 INSERT INTO public.sf_web_push_deliveries(notification_id,subscription_id)
 SELECT NEW.id,s.id FROM public.sf_web_push_subscriptions s WHERE s.user_id=NEW.recipient_id
 ON CONFLICT(notification_id,subscription_id) DO NOTHING;
 RETURN NEW;
END $push$;
REVOKE ALL ON FUNCTION public.sf_queue_web_push_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sf_queue_web_push_notification_trg ON public.notifications;
CREATE TRIGGER sf_queue_web_push_notification_trg
 AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.sf_queue_web_push_notification();

-- Claimed work is only accessible to server-only service_role. Lease expiry permits retries.
CREATE OR REPLACE FUNCTION public.sf_claim_web_push_deliveries(p_limit integer DEFAULT 20)
RETURNS TABLE(delivery_id uuid,endpoint text,p256dh text,auth_secret text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
BEGIN
 RETURN QUERY
 WITH eligible AS (
  SELECT d.id FROM public.sf_web_push_deliveries d
  WHERE d.status IN('queued','leased') AND d.next_attempt_at<=now() AND d.attempts<5
  ORDER BY d.created_at LIMIT least(greatest(p_limit,1),50)
  FOR UPDATE SKIP LOCKED
 ), leased AS (
  UPDATE public.sf_web_push_deliveries d SET status='leased',attempts=d.attempts+1,
   next_attempt_at=now()+interval '3 minutes'
  FROM eligible e WHERE d.id=e.id RETURNING d.id,d.subscription_id
 )
 SELECT leased.id,s.endpoint,s.p256dh,s.auth_secret
 FROM leased JOIN public.sf_web_push_subscriptions s ON s.id=leased.subscription_id;
END $push$;
REVOKE ALL ON FUNCTION public.sf_claim_web_push_deliveries(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sf_claim_web_push_deliveries(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.sf_finish_web_push_delivery(p_id uuid,p_status integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
DECLARE item public.sf_web_push_deliveries%ROWTYPE;
BEGIN
 SELECT * INTO item FROM public.sf_web_push_deliveries WHERE id=p_id AND status='leased' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_status IN (404,410) THEN
  DELETE FROM public.sf_web_push_subscriptions WHERE id=item.subscription_id;
  RETURN true;
 END IF;
 IF p_status BETWEEN 200 AND 299 THEN
  UPDATE public.sf_web_push_deliveries SET status='sent',processed_at=now(),last_http_status=p_status WHERE id=p_id;
 ELSIF item.attempts>=5 THEN
  UPDATE public.sf_web_push_deliveries SET status='dead',processed_at=now(),last_http_status=p_status WHERE id=p_id;
 ELSE
  UPDATE public.sf_web_push_deliveries SET status='queued',last_http_status=p_status,
   next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,item.attempts)::integer))
   WHERE id=p_id;
 END IF;
 RETURN true;
END $push$;
REVOKE ALL ON FUNCTION public.sf_finish_web_push_delivery(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sf_finish_web_push_delivery(uuid,integer) TO service_role;

-- Clean up terminal delivery attempts after 14 days without storing private payloads.
CREATE OR REPLACE FUNCTION public.sf_cleanup_web_push_deliveries()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $push$
DECLARE n integer;
BEGIN
 DELETE FROM public.sf_web_push_deliveries WHERE status IN('sent','dead')
 AND processed_at<now()-interval '14 days';
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $push$;
REVOKE ALL ON FUNCTION public.sf_cleanup_web_push_deliveries() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('sf-web-push-cleanup-v1','25 3 * * *','SELECT public.sf_cleanup_web_push_deliveries();');
