-- Support staging installations without verification tables.
CREATE OR REPLACE FUNCTION public.sf_admin_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_pending bigint := 0;
BEGIN
 IF NOT public.sf_admin_has_permission('metrics.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF to_regclass('public.verification_applications') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM public.verification_applications WHERE status = ''pending''' INTO v_pending;
 END IF;
 RETURN jsonb_build_object(
  'users',(SELECT count(*) FROM public.profiles),
  'newUsers24h',(SELECT count(*) FROM public.profiles WHERE created_at>=now()-interval '24 hours'),
  'posts',(SELECT count(*) FROM public.posts WHERE parent_id IS NULL),
  'replies',(SELECT count(*) FROM public.posts WHERE parent_id IS NOT NULL),
  'posts24h',(SELECT count(*) FROM public.posts WHERE created_at>=now()-interval '24 hours'),
  'likes',(SELECT count(*) FROM public.likes),
  'follows',(SELECT count(*) FROM public.follows),
  'pendingReports',(SELECT count(*) FROM public.reports WHERE reviewed_at IS NULL),
  'pendingVerifications',v_pending,
  'restrictedAccounts',(SELECT count(*) FROM public.sf_account_restrictions WHERE status='banned' OR (status='suspended' AND expires_at>now())),
  'announcements',(SELECT count(*) FROM public.sf_platform_announcements WHERE published)
 );
END $function$;
