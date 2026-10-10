-- STARFLOW 2.1: additive feature migration. No legacy account, post or AI data is deleted.
-- Run once on the production Supabase project. This migration is idempotent for tables/policies.
BEGIN;

-- Polls: only trusted RPCs can write poll tables or submit votes.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_poll boolean NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_gallery boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.post_polls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
 question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 160),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.poll_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 poll_id uuid NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
 label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
 position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
 UNIQUE (poll_id, position)
);
CREATE TABLE IF NOT EXISTS public.poll_votes (
 poll_id uuid NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
 option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (poll_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options(poll_id,position);
ALTER TABLE public.post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS starflow_poll_read ON public.post_polls;
CREATE POLICY starflow_poll_read ON public.post_polls FOR SELECT USING (true);
DROP POLICY IF EXISTS starflow_poll_options_read ON public.poll_options;
CREATE POLICY starflow_poll_options_read ON public.poll_options FOR SELECT USING (true);
REVOKE INSERT,UPDATE,DELETE ON public.post_polls,public.poll_options,public.poll_votes FROM anon,authenticated;
GRANT SELECT ON public.post_polls,public.poll_options TO anon,authenticated;
REVOKE ALL ON public.poll_votes FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_poll_post(p_content text,p_question text,p_options text[],p_hours integer DEFAULT 24)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_uuid uuid; poll_uuid uuid; n integer; opt text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 IF char_length(coalesce(p_content,'')) > 280 THEN RAISE EXCEPTION 'Post too long'; END IF;
 IF char_length(btrim(coalesce(p_question,''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Question length must be 1-160'; END IF;
 IF p_hours NOT IN (1,6,24,72,168) THEN RAISE EXCEPTION 'Invalid poll duration'; END IF;
 IF array_length(p_options,1) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'Poll needs 2-4 options'; END IF;
 FOR n IN 1..array_length(p_options,1) LOOP
  opt:=btrim(coalesce(p_options[n],''));
  IF char_length(opt) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Option text must be 1-100 characters'; END IF;
 END LOOP;
 INSERT INTO public.posts(author_id,content,has_poll) VALUES(auth.uid(),coalesce(nullif(btrim(coalesce(p_content,'')),''),btrim(p_question)),true) RETURNING id INTO post_uuid;
 INSERT INTO public.post_polls(post_id,question,expires_at) VALUES(post_uuid,btrim(p_question),now()+make_interval(hours=>p_hours)) RETURNING id INTO poll_uuid;
 FOR n IN 1..array_length(p_options,1) LOOP
  INSERT INTO public.poll_options(poll_id,label,position) VALUES(poll_uuid,btrim(p_options[n]),n-1);
 END LOOP;
 RETURN post_uuid;
END $$;
REVOKE ALL ON FUNCTION public.create_poll_post(text,text,text[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_poll_post(text,text,text[],integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cast_poll_vote(p_poll_id uuid,p_option_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 SELECT expires_at INTO deadline FROM public.post_polls WHERE id=p_poll_id FOR SHARE;
 IF deadline IS NULL THEN RAISE EXCEPTION 'Poll not found'; END IF;
 IF deadline<=now() THEN RAISE EXCEPTION 'Poll expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.poll_options WHERE id=p_option_id AND poll_id=p_poll_id) THEN RAISE EXCEPTION 'Invalid poll option'; END IF;
 INSERT INTO public.poll_votes(poll_id,option_id,user_id) VALUES(p_poll_id,p_option_id,auth.uid());
 RETURN true;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'You have already voted in this poll';
END $$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.poll_option_tallies(p_poll_id uuid)
RETURNS TABLE(option_id uuid,votes bigint,mine boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id, count(v.user_id), coalesce(bool_or(v.user_id=auth.uid()),false)
 FROM public.poll_options o LEFT JOIN public.poll_votes v ON v.option_id=o.id AND v.poll_id=o.poll_id
 WHERE o.poll_id=p_poll_id GROUP BY o.id,o.position ORDER BY o.position
$$;
REVOKE ALL ON FUNCTION public.poll_option_tallies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_option_tallies(uuid) TO anon,authenticated;

-- Multiple images: paths validated against post author and existing user-scoped Supabase bucket.
CREATE TABLE IF NOT EXISTS public.post_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
 media_url text NOT NULL CHECK (char_length(media_url) <= 2048 AND media_url ~ '^https://'),
 position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(post_id,position)
);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON public.post_media(post_id,position);
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_media_public_read ON public.post_media;
CREATE POLICY post_media_public_read ON public.post_media FOR SELECT USING(true);
DROP POLICY IF EXISTS post_media_insert_own ON public.post_media;
CREATE POLICY post_media_insert_own ON public.post_media FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND p.author_id=auth.uid())
 AND media_url LIKE ('https://%.supabase.co/storage/v1/object/public/post-media/' || auth.uid()::text || '/%')

);
GRANT SELECT ON public.post_media TO anon,authenticated;
GRANT INSERT ON public.post_media TO authenticated;

-- User-owned, public/private follow lists.
CREATE TABLE IF NOT EXISTS public.social_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 60),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=240),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN('public','private')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_lists_owner ON public.social_lists(owner_id);
CREATE TABLE IF NOT EXISTS public.social_list_members (
 list_id uuid NOT NULL REFERENCES public.social_lists(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(list_id,profile_id)
);
ALTER TABLE public.social_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_list_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_lists_read ON public.social_lists;
CREATE POLICY social_lists_read ON public.social_lists FOR SELECT USING(visibility='public' OR owner_id=auth.uid());
DROP POLICY IF EXISTS social_lists_create ON public.social_lists;
CREATE POLICY social_lists_create ON public.social_lists FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS social_lists_modify ON public.social_lists;
CREATE POLICY social_lists_modify ON public.social_lists FOR UPDATE TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS social_lists_delete ON public.social_lists;
CREATE POLICY social_lists_delete ON public.social_lists FOR DELETE TO authenticated USING(owner_id=auth.uid());
DROP POLICY IF EXISTS social_list_members_read ON public.social_list_members;
CREATE POLICY social_list_members_read ON public.social_list_members FOR SELECT USING(
 EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND (l.visibility='public' OR l.owner_id=auth.uid()))
);
DROP POLICY IF EXISTS social_list_members_add ON public.social_list_members;
CREATE POLICY social_list_members_add ON public.social_list_members FOR INSERT TO authenticated WITH CHECK(
 EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND l.owner_id=auth.uid())
 AND (profile_id=auth.uid() OR EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id=auth.uid() AND f.following_id=profile_id))
);
DROP POLICY IF EXISTS social_list_members_remove ON public.social_list_members;
CREATE POLICY social_list_members_remove ON public.social_list_members FOR DELETE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND l.owner_id=auth.uid())
);
GRANT SELECT ON public.social_lists,public.social_list_members TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.social_lists TO authenticated;
GRANT INSERT,DELETE ON public.social_list_members TO authenticated;

-- Public communities. Only owner can modify community metadata; self-join cannot grant moderator role.
CREATE TABLE IF NOT EXISTS public.communities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 80),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=500),
 rules text NOT NULL DEFAULT '' CHECK(char_length(rules)<=1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_members (
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK(role IN('owner','member')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(community_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.community_posts (
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(community_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_community_posts_recent ON public.community_posts(community_id,created_at DESC);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communities_read ON public.communities;
CREATE POLICY communities_read ON public.communities FOR SELECT USING(true);
DROP POLICY IF EXISTS community_members_read ON public.community_members;
CREATE POLICY community_members_read ON public.community_members FOR SELECT USING(true);
DROP POLICY IF EXISTS community_members_join ON public.community_members;
CREATE POLICY community_members_join ON public.community_members FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND role='member');
DROP POLICY IF EXISTS community_members_leave ON public.community_members;
CREATE POLICY community_members_leave ON public.community_members FOR DELETE TO authenticated USING(user_id=auth.uid() AND role='member');
DROP POLICY IF EXISTS community_posts_read ON public.community_posts;
CREATE POLICY community_posts_read ON public.community_posts FOR SELECT USING(true);
REVOKE INSERT,UPDATE,DELETE ON public.communities,public.community_posts FROM anon,authenticated;
GRANT SELECT ON public.communities,public.community_members,public.community_posts TO anon,authenticated;
GRANT INSERT,DELETE ON public.community_members TO authenticated;

CREATE OR REPLACE FUNCTION public.create_community(p_name text,p_description text DEFAULT '',p_rules text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 IF char_length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Community name must be 2-80 characters'; END IF;
 IF char_length(coalesce(p_description,''))>500 OR char_length(coalesce(p_rules,''))>1000 THEN RAISE EXCEPTION 'Description/rules too long'; END IF;
 INSERT INTO public.communities(owner_id,name,description,rules) VALUES(auth.uid(),btrim(p_name),coalesce(p_description,''),coalesce(p_rules,'')) RETURNING id INTO c_id;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(c_id,auth.uid(),'owner');
 RETURN c_id;
END $$;
REVOKE ALL ON FUNCTION public.create_community(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_community(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_community_post(p_community uuid,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_community AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Join community before posting';
 END IF;
 IF char_length(btrim(coalesce(p_content,''))) NOT BETWEEN 1 AND 280 THEN RAISE EXCEPTION 'Post length must be 1-280'; END IF;
 INSERT INTO public.posts(author_id,content) VALUES(auth.uid(),btrim(p_content)) RETURNING id INTO p_id;
 INSERT INTO public.community_posts(community_id,post_id) VALUES(p_community,p_id);
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.publish_community_post(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_community_post(uuid,text) TO authenticated;

-- Real business analytics, no fictional views, clicks or income.
CREATE OR REPLACE FUNCTION public.creator_summary(p_days integer DEFAULT 30)
RETURNS TABLE(post_count bigint,likes_received bigint,reposts_received bigint,replies_received bigint,follower_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT
 (SELECT count(*) FROM posts p WHERE p.author_id=auth.uid() AND p.created_at>=now()-make_interval(days=>least(greatest(coalesce(p_days,30),1),365))),
 (SELECT count(*) FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.author_id=auth.uid() AND l.created_at>=now()-make_interval(days=>least(greatest(coalesce(p_days,30),1),365))),
 (SELECT count(*) FROM reposts r JOIN posts p ON p.id=r.post_id WHERE p.author_id=auth.uid() AND r.created_at>=now()-make_interval(days=>least(greatest(coalesce(p_days,30),1),365))),
 (SELECT count(*) FROM posts reply JOIN posts p ON p.id=reply.parent_id WHERE p.author_id=auth.uid() AND reply.created_at>=now()-make_interval(days=>least(greatest(coalesce(p_days,30),1),365))),
 (SELECT count(*) FROM follows WHERE following_id=auth.uid())
 WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.creator_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_summary(integer) TO authenticated;

-- Platform administrator roles are provisioned out-of-band by the project owner.
-- NO user is automatically granted this role by this migration.
CREATE TABLE IF NOT EXISTS public.platform_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.platform_admins WHERE user_id=auth.uid()
 )
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Actual verification decisions are issued by trusted database RPCs, never from client updates.
CREATE TABLE IF NOT EXISTS public.verification_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.verification_applications(id),
 reviewer_id uuid NOT NULL REFERENCES auth.users(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 old_status text NOT NULL,new_status text NOT NULL,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_audit ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON public.verification_audit FROM anon,authenticated;
DROP POLICY IF EXISTS admin_verification_applications_read ON public.verification_applications;
CREATE POLICY admin_verification_applications_read ON public.verification_applications FOR SELECT TO authenticated USING(public.is_platform_admin());
DROP POLICY IF EXISTS admin_verifications_read_audit ON public.verification_audit;
CREATE POLICY admin_verifications_read_audit ON public.verification_audit FOR SELECT TO authenticated USING(public.is_platform_admin());
GRANT SELECT ON public.verification_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.review_verification_application(p_application uuid,p_decision text,p_note text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.verification_applications%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid review outcome'; END IF;
 IF char_length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Review note too long'; END IF;
 SELECT * INTO item FROM public.verification_applications WHERE id=p_application FOR UPDATE;
 IF NOT FOUND OR item.status<>'pending' THEN RAISE EXCEPTION 'Application not pending'; END IF;
 UPDATE public.verification_applications SET status=p_decision,reviewed_at=now(),reviewer_note=left(coalesce(p_note,''),1000) WHERE id=item.id;
 IF p_decision='approved' THEN
  INSERT INTO public.account_verifications(profile_id,verification_type,status,reviewed_at,reviewer_id,reviewer_note,updated_at)
  VALUES(item.user_id,item.verification_type,'approved',now(),auth.uid(),left(coalesce(p_note,''),1000),now())
  ON CONFLICT(profile_id) DO UPDATE SET verification_type=excluded.verification_type,status='approved',reviewed_at=now(),reviewer_id=excluded.reviewer_id,reviewer_note=excluded.reviewer_note,updated_at=now();
 END IF;
 INSERT INTO public.verification_audit(application_id,reviewer_id,user_id,old_status,new_status,note)
 VALUES(item.id,auth.uid(),item.user_id,item.status,p_decision,left(coalesce(p_note,''),1000));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.review_verification_application(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_verification_application(uuid,text,text) TO authenticated;

-- Moderation: the existing admin interface expects reports.reviewed_at.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
DROP POLICY IF EXISTS starflow_admin_reports_read ON public.reports;
CREATE POLICY starflow_admin_reports_read ON public.reports FOR SELECT TO authenticated USING(public.is_platform_admin());
DROP POLICY IF EXISTS starflow_admin_reports_review ON public.reports;
CREATE POLICY starflow_admin_reports_review ON public.reports FOR UPDATE TO authenticated
 USING(public.is_platform_admin()) WITH CHECK(public.is_platform_admin());
DROP POLICY IF EXISTS starflow_admin_posts_remove ON public.posts;
CREATE POLICY starflow_admin_posts_remove ON public.posts FOR DELETE TO authenticated USING(public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.revoke_account_verification(p_profile_id uuid,p_reason text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE app_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin required';END IF;
 IF char_length(coalesce(p_reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_verifications WHERE profile_id=p_profile_id AND status='approved' FOR UPDATE)
 THEN RAISE EXCEPTION 'No active verification found';END IF;
 SELECT id INTO app_id FROM public.verification_applications WHERE user_id=p_profile_id AND status='approved'
 ORDER BY submitted_at DESC LIMIT 1;
 IF app_id IS NULL THEN RAISE EXCEPTION 'No corresponding approved application found';END IF;
 UPDATE public.account_verifications SET status='revoked',reviewer_id=auth.uid(),reviewed_at=now(),
 reviewer_note=left(coalesce(p_reason,''),1000),updated_at=now() WHERE profile_id=p_profile_id;
 INSERT INTO public.verification_audit(application_id,reviewer_id,user_id,old_status,new_status,note)
 VALUES(app_id,auth.uid(),p_profile_id,'approved','revoked',left(coalesce(p_reason,''),1000));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.revoke_account_verification(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_account_verification(uuid,text) TO authenticated;

-- Atomic multi-image post publication: validates ownership in the upload bucket.
CREATE OR REPLACE FUNCTION public.create_gallery_post(p_content text,p_urls text[],p_parent_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p_id uuid; image_url text; n integer; path text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Login required';END IF;
 IF char_length(coalesce(p_content,''))>280 THEN RAISE EXCEPTION 'Post too long';END IF;
 IF array_length(p_urls,1) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'Gallery needs 2-4 pictures';END IF;
 FOR n IN 1..array_length(p_urls,1) LOOP
  image_url:=p_urls[n];
  IF image_url IS NULL OR char_length(image_url)>2048 OR
   image_url NOT LIKE ('https://%.supabase.co/storage/v1/object/public/post-media/'||auth.uid()::text||'/%')
  THEN RAISE EXCEPTION 'Invalid media URL';END IF;
  path:=split_part(image_url,'/post-media/',2);
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='post-media' AND name=path)
  THEN RAISE EXCEPTION 'Uploaded image not found';END IF;
 END LOOP;
 INSERT INTO public.posts(author_id,content,image_url,has_gallery,parent_id)
 VALUES(auth.uid(),btrim(coalesce(p_content,'')),p_urls[1],true,p_parent_id) RETURNING id INTO p_id;
 FOR n IN 1..array_length(p_urls,1) LOOP
  INSERT INTO public.post_media(post_id,media_url,position) VALUES(p_id,p_urls[n],n-1);
 END LOOP;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.create_gallery_post(text,text[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_gallery_post(text,text[],uuid) TO authenticated;

COMMIT;
