-- Starflow: cloud text drafts, actual hashtag ranking, text-only scheduled posts.
-- Runtime publication requires the separate pg_cron migration to be active.
CREATE TABLE IF NOT EXISTS public.sf_post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_post_drafts_owner_idx ON public.sf_post_drafts(user_id,updated_at DESC);
ALTER TABLE public.sf_post_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_post_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sf_post_drafts TO authenticated;
DROP POLICY IF EXISTS sf_post_drafts_owner_select ON public.sf_post_drafts;
CREATE POLICY sf_post_drafts_owner_select ON public.sf_post_drafts FOR SELECT TO authenticated
 USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS sf_post_drafts_owner_insert ON public.sf_post_drafts;
CREATE POLICY sf_post_drafts_owner_insert ON public.sf_post_drafts FOR INSERT TO authenticated
 WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS sf_post_drafts_owner_update ON public.sf_post_drafts;
CREATE POLICY sf_post_drafts_owner_update ON public.sf_post_drafts FOR UPDATE TO authenticated
 USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS sf_post_drafts_owner_delete ON public.sf_post_drafts;
CREATE POLICY sf_post_drafts_owner_delete ON public.sf_post_drafts FOR DELETE TO authenticated
 USING ((SELECT auth.uid())=user_id);

CREATE TABLE IF NOT EXISTS public.sf_scheduled_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
 scheduled_for timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','cancelled','failed')),
 post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_scheduled_posts_pending_idx ON public.sf_scheduled_posts(scheduled_for)
 WHERE status='pending';
CREATE INDEX IF NOT EXISTS sf_scheduled_posts_owner_idx ON public.sf_scheduled_posts(user_id,scheduled_for DESC);
ALTER TABLE public.sf_scheduled_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_scheduled_posts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sf_scheduled_posts TO authenticated;
DROP POLICY IF EXISTS sf_scheduled_posts_owner_read ON public.sf_scheduled_posts;
CREATE POLICY sf_scheduled_posts_owner_read ON public.sf_scheduled_posts FOR SELECT TO authenticated
 USING ((SELECT auth.uid())=user_id);

CREATE OR REPLACE FUNCTION public.sf_schedule_text_post(p_content text,p_scheduled_for timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); target uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_content,''))) NOT BETWEEN 1 AND 280 THEN
  RAISE EXCEPTION 'Text must contain 1–280 characters'; END IF;
 IF p_scheduled_for IS NULL OR p_scheduled_for<now()+interval '5 minutes'
 OR p_scheduled_for>now()+interval '30 days' THEN
  RAISE EXCEPTION 'Scheduled time must be 5 minutes to 30 days ahead'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_account_restrictions r WHERE r.user_id=uid
 AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))) THEN
  RAISE EXCEPTION 'Your account is restricted' USING ERRCODE='42501'; END IF;
 IF (SELECT value FROM public.sf_platform_settings WHERE key='posting_enabled')='false'::jsonb THEN
  RAISE EXCEPTION 'Posting is paused'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,3891));
 IF (SELECT count(*) FROM public.sf_scheduled_posts WHERE user_id=uid AND status='pending')>=20 THEN
  RAISE EXCEPTION 'Maximum 20 upcoming posts'; END IF;
 INSERT INTO public.sf_scheduled_posts(user_id,content,scheduled_for)
 VALUES(uid,trim(p_content),p_scheduled_for) RETURNING id INTO target;
 RETURN target;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_schedule_text_post(text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_schedule_text_post(text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_cancel_scheduled_post(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 UPDATE public.sf_scheduled_posts SET status='cancelled',updated_at=now()
 WHERE id=p_id AND user_id=uid AND status='pending';
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_cancel_scheduled_post(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_cancel_scheduled_post(uuid) TO authenticated;

-- Called only by trusted server cron, not browser requests.
-- Failed posts remain retryable up to 5 attempts; no false success state.
CREATE OR REPLACE FUNCTION public.sf_dispatch_scheduled_posts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE item record; published_id uuid; processed integer:=0;
BEGIN
 IF (SELECT value FROM public.sf_platform_settings WHERE key='posting_enabled')='false'::jsonb THEN
  RETURN 0; END IF;
 FOR item IN
  SELECT id,user_id,content FROM public.sf_scheduled_posts
  WHERE status='pending' AND scheduled_for<=now() AND attempts<5
  ORDER BY scheduled_for ASC,id ASC LIMIT 30 FOR UPDATE SKIP LOCKED
 LOOP
  IF EXISTS (SELECT 1 FROM public.sf_account_restrictions r WHERE r.user_id=item.user_id
   AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))) THEN
   UPDATE public.sf_scheduled_posts SET status='failed',last_error='账号当前受限',updated_at=now()
   WHERE id=item.id; CONTINUE;
  END IF;
  BEGIN
   INSERT INTO public.posts(author_id,content) VALUES(item.user_id,item.content)
   RETURNING id INTO published_id;
   UPDATE public.sf_scheduled_posts SET status='published',post_id=published_id,
    attempts=attempts+1,last_error=NULL,updated_at=now() WHERE id=item.id;
   processed:=processed+1;
  EXCEPTION WHEN others THEN
   UPDATE public.sf_scheduled_posts SET attempts=attempts+1,
    status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END,
    last_error='发布失败，系统将按计划重试',updated_at=now() WHERE id=item.id;
  END;
 END LOOP;
 RETURN processed;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_dispatch_scheduled_posts() FROM PUBLIC,anon,authenticated,service_role;

-- Scans the most recent 5,000 public posts from the past 7 days.
-- Each post counts once per hashtag; we do not invent rank or view counts.
CREATE OR REPLACE FUNCTION public.sf_trending_hashtags()
RETURNS TABLE(tag text,post_count bigint,last_seen timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH recent AS (
 SELECT id,content,created_at FROM public.posts
 WHERE created_at>=now()-interval '7 days' AND parent_id IS NULL
 ORDER BY created_at DESC LIMIT 5000
 ), tags AS (
  SELECT DISTINCT r.id,lower(substring(m.match[1] FROM 2)) AS tag,r.created_at
  FROM recent r CROSS JOIN LATERAL regexp_matches(r.content,'#[[:alnum:]_一-龥]+','g') AS m(match)
 )
 SELECT t.tag,count(*)::bigint AS post_count,max(t.created_at) AS last_seen
 FROM tags t WHERE char_length(t.tag) BETWEEN 1 AND 40
 GROUP BY t.tag ORDER BY post_count DESC,last_seen DESC,tag ASC LIMIT 15
 $fn$;
REVOKE ALL ON FUNCTION public.sf_trending_hashtags() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_trending_hashtags() TO authenticated;
