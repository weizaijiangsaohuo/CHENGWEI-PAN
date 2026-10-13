-- Starflow account/content appeal workflow.
CREATE TABLE IF NOT EXISTS public.sf_user_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN ('account','content','verification','other')),
 subject text NOT NULL CHECK(char_length(trim(subject)) BETWEEN 5 AND 100),
 body text NOT NULL CHECK(char_length(trim(body)) BETWEEN 20 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 response text CHECK(response IS NULL OR char_length(response) BETWEEN 10 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_user_appeals_owner_idx ON public.sf_user_appeals(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sf_user_appeals_pending_idx ON public.sf_user_appeals(created_at) WHERE status='pending';
ALTER TABLE public.sf_user_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_user_appeals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sf_user_appeals TO authenticated;
DROP POLICY IF EXISTS sf_appeals_owner_or_reviewer_read ON public.sf_user_appeals;
CREATE POLICY sf_appeals_owner_or_reviewer_read ON public.sf_user_appeals
 FOR SELECT TO authenticated USING (
   user_id=(SELECT auth.uid())
   OR (SELECT public.sf_admin_has_permission('users.restrict'))
 );

-- User submits an appeal, but cannot edit status or create another user's appeal.
CREATE OR REPLACE FUNCTION public.sf_submit_appeal(p_category text,p_subject text,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); newid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 IF p_category IS NULL OR p_category NOT IN('account','content','verification','other') THEN
  RAISE EXCEPTION 'Invalid appeal category'; END IF;
 IF char_length(trim(coalesce(p_subject,''))) NOT BETWEEN 5 AND 100 THEN
  RAISE EXCEPTION 'Subject must be 5–100 characters'; END IF;
 IF char_length(trim(coalesce(p_body,''))) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'Appeal must be 20–2000 characters'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,581));
 IF (SELECT count(*) FROM public.sf_user_appeals WHERE user_id=uid
  AND status='pending')>=3 THEN
  RAISE EXCEPTION 'You have three pending appeals; wait for a response'; END IF;
 IF (SELECT count(*) FROM public.sf_user_appeals WHERE user_id=uid
  AND created_at>now()-interval '24 hours')>=5 THEN
  RAISE EXCEPTION 'Too many appeals in the last 24 hours'; END IF;
 INSERT INTO public.sf_user_appeals(user_id,category,subject,body)
 VALUES(uid,p_category,trim(p_subject),trim(p_body)) RETURNING id INTO newid;
 RETURN newid;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_submit_appeal(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_submit_appeal(text,text,text) TO authenticated;

-- Admin reviews a request; a positive decision is NOT an automatic unban.
-- Account sanctions must be changed through existing audited restriction actions.
CREATE OR REPLACE FUNCTION public.sf_admin_review_appeal(p_appeal_id uuid,p_decision text,p_response text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid()); target uuid; actor_role text;
BEGIN
 SELECT role INTO actor_role FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF actor_role IS NULL OR actor_role NOT IN('founder','super_admin') THEN
  RAISE EXCEPTION 'Only founder or super admins may decide appeals' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN('approved','rejected') THEN
  RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
 IF char_length(trim(coalesce(p_response,''))) NOT BETWEEN 10 AND 1000 THEN
  RAISE EXCEPTION 'Review response must be 10–1000 characters'; END IF;
 SELECT user_id INTO target FROM public.sf_user_appeals
  WHERE id=p_appeal_id AND status='pending' FOR UPDATE;
 IF target IS NULL THEN RAISE EXCEPTION 'Appeal not found or already handled'; END IF;
 UPDATE public.sf_user_appeals SET status=p_decision,reviewer_id=actor,
  response=trim(p_response),reviewed_at=now(),updated_at=now()
 WHERE id=p_appeal_id;
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'appeal.review',target,jsonb_build_object('appeal_id',p_appeal_id,'decision',p_decision));
 INSERT INTO public.notifications(recipient_id,actor_id,kind,post_id,message)
 VALUES(target,actor,'appeal_result',NULL,
  '申诉审核结果：'||CASE WHEN p_decision='approved' THEN '已认可' ELSE '未通过' END||
  '。请在申诉中心查看完整说明。');
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_review_appeal(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_review_appeal(uuid,text,text) TO authenticated;
