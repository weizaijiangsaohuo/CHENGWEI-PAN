-- Starflow Admin Console: trusted RPCs, audit trail, and platform-wide moderation.
CREATE OR REPLACE FUNCTION public.sf_admin_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF NOT public.sf_admin_has_permission('metrics.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'users',(SELECT count(*) FROM public.profiles),
  'newUsers24h',(SELECT count(*) FROM public.profiles WHERE created_at>=now()-interval '24 hours'),
  'posts',(SELECT count(*) FROM public.posts WHERE parent_id IS NULL),
  'replies',(SELECT count(*) FROM public.posts WHERE parent_id IS NOT NULL),
  'posts24h',(SELECT count(*) FROM public.posts WHERE created_at>=now()-interval '24 hours'),
  'likes',(SELECT count(*) FROM public.likes),
  'follows',(SELECT count(*) FROM public.follows),
  'pendingReports',(SELECT count(*) FROM public.reports WHERE reviewed_at IS NULL),
  'pendingVerifications',(SELECT count(*) FROM public.verification_applications WHERE status='pending'),
  'restrictedAccounts',(SELECT count(*) FROM public.sf_account_restrictions WHERE status='banned' OR (status='suspended' AND expires_at>now())),
  'announcements',(SELECT count(*) FROM public.sf_platform_announcements WHERE published)
 );
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_find_users(p_query text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT public.sf_admin_has_permission('users.read') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF char_length(coalesce(p_query,''))>40 THEN RAISE EXCEPTION 'Search too long'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
 FROM (
  SELECT p.id,p.handle,p.display_name,p.created_at,
  CASE WHEN r.status='suspended' AND r.expires_at<=now() THEN 'active' ELSE coalesce(r.status,'active') END AS account_status,
  r.expires_at, sr.role AS staff_role, sr.enabled AS staff_enabled
  FROM public.profiles p
  LEFT JOIN public.sf_account_restrictions r ON r.user_id=p.id
  LEFT JOIN public.sf_staff_roles sr ON sr.user_id=p.id
  WHERE p.handle ILIKE ('%'||replace(replace(coalesce(p_query,''),'%','\%'),'_','\_')||'%') ESCAPE '\'
    OR p.display_name ILIKE ('%'||replace(replace(coalesce(p_query,''),'%','\%'),'_','\_')||'%') ESCAPE '\'
  ORDER BY p.created_at DESC LIMIT 50
 ) q;
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_set_staff(p_user_id uuid,p_role text,p_enabled boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE target_handle text;
BEGIN
 IF NOT public.sf_admin_has_permission('staff.manage') OR NOT EXISTS
   (SELECT 1 FROM public.sf_staff_roles WHERE user_id=auth.uid() AND role='founder' AND enabled)
 THEN RAISE EXCEPTION 'Founder permission required' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('super_admin','official','senior_admin','moderator','verification_reviewer','support','analyst') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot edit own role'; END IF;
 SELECT handle INTO target_handle FROM public.profiles WHERE id=p_user_id;
 IF target_handle IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_staff_roles WHERE user_id=p_user_id AND role='founder') THEN RAISE EXCEPTION 'Founder role protected'; END IF;
 INSERT INTO public.sf_staff_roles(user_id,role,enabled,granted_by,updated_at)
 VALUES(p_user_id,p_role,p_enabled,auth.uid(),now())
 ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,enabled=excluded.enabled,granted_by=excluded.granted_by,updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(auth.uid(),'staff.set_role',p_user_id,jsonb_build_object('role',p_role,'enabled',p_enabled));
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_restrict_user(p_user_id uuid,p_action text,p_reason text,p_expires_at timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE decision text;
BEGIN
 IF p_action NOT IN ('warn','suspend','ban','restore') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF NOT public.sf_admin_has_permission(CASE WHEN p_action='warn' THEN 'users.warn' ELSE 'users.restrict' END)
 THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Reason must be 10-1000 characters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF p_user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.sf_staff_roles WHERE user_id=p_user_id AND enabled)
 THEN RAISE EXCEPTION 'Staff accounts are protected from this operation' USING ERRCODE='42501'; END IF;
 IF p_action='suspend' AND (p_expires_at IS NULL OR p_expires_at<=now()+interval '5 minutes' OR p_expires_at>now()+interval '366 days')
 THEN RAISE EXCEPTION 'Suspension end must be within 5 minutes and 366 days'; END IF;
 IF p_action <> 'warn' THEN
  INSERT INTO public.sf_account_restrictions(user_id,status,expires_at,reason,updated_by,updated_at)
  VALUES(p_user_id,CASE p_action WHEN 'suspend' THEN 'suspended' WHEN 'ban' THEN 'banned' ELSE 'active' END,
    CASE WHEN p_action='suspend' THEN p_expires_at ELSE NULL END,btrim(p_reason),auth.uid(),now())
  ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at,
    reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 decision:=CASE p_action WHEN 'warn' THEN 'warning' WHEN 'restore' THEN 'resolved' ELSE 'confirmed_violation' END;
 INSERT INTO public.account_moderation_decisions(user_id,decided_by,decision,reason)
 VALUES(p_user_id,auth.uid(),decision,btrim(p_reason));
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(auth.uid(),'user.'||p_action,p_user_id,jsonb_build_object('reason',p_reason,'expiresAt',p_expires_at));
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_moderate_post(p_post_id uuid,p_action text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE author uuid;
BEGIN
 IF NOT public.sf_admin_has_permission('content.moderate') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('hide','restore','delete') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Reason must be 10-1000 characters'; END IF;
 SELECT author_id INTO author FROM public.posts WHERE id=p_post_id FOR UPDATE;
 IF author IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
 IF p_action='delete' THEN DELETE FROM public.posts WHERE id=p_post_id;
 ELSIF p_action='hide' THEN
  INSERT INTO public.sf_moderated_posts(post_id,hidden,reason,updated_by,updated_at)
  VALUES(p_post_id,true,btrim(p_reason),auth.uid(),now())
  ON CONFLICT(post_id) DO UPDATE SET hidden=true,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 ELSE
  UPDATE public.sf_moderated_posts SET hidden=false,reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now()
   WHERE post_id=p_post_id;
 END IF;
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,target_post_id,details)
 VALUES(auth.uid(),'post.'||p_action,author,p_post_id,jsonb_build_object('reason',p_reason));
 IF p_action IN ('hide','delete') THEN
  INSERT INTO public.notifications(recipient_id,kind,message)
  VALUES(author,'account_warning',left('你的公开内容因平台审核被'||CASE WHEN p_action='hide' THEN '隐藏' ELSE '删除' END||'。说明：'||p_reason,1000));
 END IF;
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_review_report(p_report_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE post_id uuid;
BEGIN
 IF NOT public.sf_admin_has_permission('reports.manage') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 UPDATE public.reports SET reviewed_at=now() WHERE id=p_report_id AND reviewed_at IS NULL RETURNING reports.post_id INTO post_id;
 IF post_id IS NULL THEN RAISE EXCEPTION 'Pending report not found'; END IF;
 INSERT INTO public.sf_admin_activity(actor_id,action,target_post_id,details)
 VALUES(auth.uid(),'report.review',post_id,jsonb_build_object('reportId',p_report_id));
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_save_announcement(p_title text,p_body text,p_published boolean,p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result uuid;
BEGIN
 IF NOT public.sf_admin_has_permission('announcements.manage') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 120 OR char_length(btrim(coalesce(p_body,''))) NOT BETWEEN 2 AND 2000
 THEN RAISE EXCEPTION 'Announcement title/body length invalid'; END IF;
 IF p_expires_at IS NOT NULL AND p_expires_at<=now() THEN RAISE EXCEPTION 'Expiry must be future'; END IF;
 INSERT INTO public.sf_platform_announcements(title,body,published,author_id,expires_at)
 VALUES(btrim(p_title),btrim(p_body),p_published,auth.uid(),p_expires_at) RETURNING id INTO result;
 INSERT INTO public.sf_admin_activity(actor_id,action,details) VALUES(auth.uid(),'announcement.create',jsonb_build_object('id',result,'published',p_published));
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_archive_announcement(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF NOT public.sf_admin_has_permission('announcements.manage') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 UPDATE public.sf_platform_announcements SET published=false WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found'; END IF;
 INSERT INTO public.sf_admin_activity(actor_id,action,details) VALUES(auth.uid(),'announcement.archive',jsonb_build_object('id',p_id));
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_update_setting(p_key text,p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF NOT public.sf_admin_has_permission('settings.manage') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_key NOT IN ('posting_enabled','maintenance_mode','registration_enabled','homepage_title','public_support_email') THEN RAISE EXCEPTION 'Invalid setting'; END IF;
 IF p_key IN ('posting_enabled','maintenance_mode','registration_enabled') AND jsonb_typeof(p_value)<>'boolean'
 THEN RAISE EXCEPTION 'Boolean required'; END IF;
 IF p_key IN ('homepage_title','public_support_email') AND (jsonb_typeof(p_value)<>'string' OR char_length(p_value#>>'{}')>160)
 THEN RAISE EXCEPTION 'Text value invalid'; END IF;
 INSERT INTO public.sf_platform_settings(key,value,updated_by,updated_at) VALUES(p_key,p_value,auth.uid(),now())
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,details) VALUES(auth.uid(),'setting.update',jsonb_build_object('key',p_key,'value',p_value));
 RETURN true;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_public_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM public.sf_platform_settings
 WHERE key IN ('posting_enabled','maintenance_mode','registration_enabled','homepage_title','public_support_email');
$fn$;
CREATE OR REPLACE FUNCTION public.sf_admin_send_notice_v2(p_recipient uuid,p_kind text,p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result uuid;
BEGIN
 IF NOT public.sf_admin_has_permission('notices.send') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('system_announcement','account_security','account_warning') THEN RAISE EXCEPTION 'Invalid notice category'; END IF;
 IF char_length(btrim(coalesce(p_message,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Notice must be 1-1000 characters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient) THEN RAISE EXCEPTION 'User not found'; END IF;
 INSERT INTO public.notifications(recipient_id,kind,message)
 VALUES(p_recipient,p_kind,btrim(p_message)) RETURNING id INTO result;
 INSERT INTO public.official_notification_audit(notification_id,sent_by,recipient_id,kind)
 VALUES(result,auth.uid(),p_recipient,p_kind);
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(auth.uid(),'notice.send',p_recipient,jsonb_build_object('kind',p_kind,'notificationId',result));
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.sf_post_is_visible(p_post_id uuid,p_author uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT NOT EXISTS(SELECT 1 FROM public.sf_moderated_posts m WHERE m.post_id=p_post_id AND m.hidden)
 OR p_author=auth.uid() OR public.sf_admin_has_permission('content.moderate');
$fn$;
-- Post SELECT visibility now honors real moderation; no access to hidden content for unrelated users.
DROP POLICY IF EXISTS "read posts" ON public.posts;
CREATE POLICY "read posts" ON public.posts FOR SELECT TO authenticated
 USING(public.sf_post_is_visible(id,author_id));
CREATE OR REPLACE FUNCTION public.sf_guard_restricted_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); blocked boolean;
BEGIN
 IF uid IS NULL THEN RETURN NEW; END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.sf_account_restrictions r
  WHERE r.user_id=uid AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))
 ) INTO blocked;
 IF blocked THEN RAISE EXCEPTION 'Your account is restricted. Contact Starflow support to appeal.' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='posts' AND NOT public.sf_admin_has_permission('content.moderate') AND
  (SELECT value FROM public.sf_platform_settings WHERE key='posting_enabled')='false'::jsonb
 THEN RAISE EXCEPTION 'Posting is currently disabled' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $fn$;
DO $fn$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['posts','likes','follows','reposts','bookmarks','dm_messages','poll_votes'] LOOP
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
   EXECUTE format('DROP TRIGGER IF EXISTS sf_block_restricted_writes ON public.%I',t);
   EXECUTE format('CREATE TRIGGER sf_block_restricted_writes BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sf_guard_restricted_writes()',t);
  END IF;
 END LOOP;
END $fn$;
DO $fn$
DECLARE fname text;
BEGIN
 FOREACH fname IN ARRAY ARRAY[
 'sf_admin_metrics()','sf_admin_find_users(text)','sf_admin_set_staff(uuid,text,boolean)',
 'sf_admin_restrict_user(uuid,text,text,timestamp with time zone)',
 'sf_admin_moderate_post(uuid,text,text)','sf_admin_review_report(uuid)',
 'sf_admin_save_announcement(text,text,boolean,timestamp with time zone)',
 'sf_admin_archive_announcement(uuid)','sf_admin_update_setting(text,jsonb)',
 'sf_admin_send_notice_v2(uuid,text,text)','sf_post_is_visible(uuid,uuid)',
 'sf_guard_restricted_writes()'
 ] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||fname||' FROM PUBLIC,anon';
  IF fname <> 'sf_guard_restricted_writes()' THEN EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fname||' TO authenticated'; END IF;
 END LOOP;
END $fn$;
GRANT EXECUTE ON FUNCTION public.sf_public_settings() TO anon,authenticated;
