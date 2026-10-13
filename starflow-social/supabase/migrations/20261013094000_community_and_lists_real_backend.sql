-- Starflow real communities & lists, with moderated join requests.
-- All private mutations use row ownership or identity-checked database RPCs.

CREATE TABLE IF NOT EXISTS public.social_lists(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 60),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=240),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','private')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_social_lists_owner_idx ON public.social_lists(owner_id);
CREATE TABLE IF NOT EXISTS public.social_list_members(
 list_id uuid NOT NULL REFERENCES public.social_lists(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(list_id,profile_id)
);
ALTER TABLE public.social_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_list_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_lists,public.social_list_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.social_lists,public.social_list_members TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.social_lists TO authenticated;
GRANT INSERT,DELETE ON public.social_list_members TO authenticated;
DROP POLICY IF EXISTS sf_social_lists_read ON public.social_lists;
CREATE POLICY sf_social_lists_read ON public.social_lists FOR SELECT TO anon,authenticated
 USING(visibility='public' OR owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_social_lists_create ON public.social_lists;
CREATE POLICY sf_social_lists_create ON public.social_lists FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_social_lists_modify ON public.social_lists;
CREATE POLICY sf_social_lists_modify ON public.social_lists FOR UPDATE TO authenticated
 USING(owner_id=(SELECT auth.uid())) WITH CHECK(owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_social_lists_remove ON public.social_lists;
CREATE POLICY sf_social_lists_remove ON public.social_lists FOR DELETE TO authenticated USING(owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_social_list_members_read ON public.social_list_members;
CREATE POLICY sf_social_list_members_read ON public.social_list_members FOR SELECT TO anon,authenticated
 USING(EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND (l.visibility='public' OR l.owner_id=(SELECT auth.uid()))));
DROP POLICY IF EXISTS sf_social_list_members_insert ON public.social_list_members;
CREATE POLICY sf_social_list_members_insert ON public.social_list_members FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND l.owner_id=(SELECT auth.uid()))
 AND (profile_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.follows f
 WHERE f.follower_id=(SELECT auth.uid()) AND f.following_id=profile_id)));
DROP POLICY IF EXISTS sf_social_list_members_delete ON public.social_list_members;
CREATE POLICY sf_social_list_members_delete ON public.social_list_members FOR DELETE TO authenticated
 USING(EXISTS(SELECT 1 FROM public.social_lists l WHERE l.id=list_id AND l.owner_id=(SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.communities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 80),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=500),
 rules text NOT NULL DEFAULT '' CHECK(char_length(rules)<=1000),
 join_policy text NOT NULL DEFAULT 'open' CHECK(join_policy IN ('open','approval')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_members(
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(community_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.community_posts(
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(community_id,post_id)
);
CREATE INDEX IF NOT EXISTS sf_community_posts_recent_idx ON public.community_posts(community_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.community_join_requests(
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 PRIMARY KEY(community_id,user_id)
);
CREATE INDEX IF NOT EXISTS sf_community_join_requests_pending_idx ON public.community_join_requests(community_id,created_at)
 WHERE status='pending';

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communities,public.community_members,public.community_posts,public.community_join_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.communities,public.community_members,public.community_posts TO anon,authenticated;
GRANT SELECT ON public.community_join_requests TO authenticated;
-- No direct browser writes to membership, role, moderation, content mapping or join status.
DROP POLICY IF EXISTS sf_communities_public_read ON public.communities;
CREATE POLICY sf_communities_public_read ON public.communities FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS sf_communities_owner_update ON public.communities;
CREATE POLICY sf_communities_owner_update ON public.communities FOR UPDATE TO authenticated
 USING(owner_id=(SELECT auth.uid())) WITH CHECK(owner_id=(SELECT auth.uid()));
GRANT UPDATE(name,description,rules,join_policy) ON public.communities TO authenticated;
DROP POLICY IF EXISTS sf_community_members_read ON public.community_members;
CREATE POLICY sf_community_members_read ON public.community_members FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS sf_community_posts_public_read ON public.community_posts;
CREATE POLICY sf_community_posts_public_read ON public.community_posts FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS sf_community_requests_read ON public.community_join_requests;
CREATE POLICY sf_community_requests_read ON public.community_join_requests FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR EXISTS(
  SELECT 1 FROM public.communities c WHERE c.id=community_id AND c.owner_id=(SELECT auth.uid())
 ));

CREATE OR REPLACE FUNCTION public.create_community(p_name text,p_description text DEFAULT '',p_rules text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); c_id uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80
 OR char_length(coalesce(p_description,''))>500 OR char_length(coalesce(p_rules,''))>1000 THEN
  RAISE EXCEPTION 'Invalid community name or description'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_account_restrictions r WHERE r.user_id=uid
  AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))) THEN
  RAISE EXCEPTION 'Account restricted' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,39031));
 IF (SELECT count(*) FROM public.communities WHERE owner_id=uid)>=10 THEN
  RAISE EXCEPTION 'Maximum 10 owned communities'; END IF;
 INSERT INTO public.communities(owner_id,name,description,rules)
 VALUES(uid,btrim(p_name),coalesce(p_description,''),coalesce(p_rules,''))
 RETURNING id INTO c_id;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(c_id,uid,'owner');
 RETURN c_id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_community(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_community(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_community_join(p_community uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); policy text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 SELECT c.join_policy INTO policy FROM public.communities c WHERE c.id=p_community;
 IF policy IS NULL THEN RAISE EXCEPTION 'Community not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_account_restrictions r WHERE r.user_id=uid
  AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))) THEN
  RAISE EXCEPTION 'Account restricted' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_community AND user_id=uid)
 THEN RETURN 'joined'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||p_community::text,31033));
 IF policy='open' THEN
  INSERT INTO public.community_members(community_id,user_id,role) VALUES(p_community,uid,'member')
   ON CONFLICT DO NOTHING;
  RETURN 'joined';
 END IF;
 INSERT INTO public.community_join_requests(community_id,user_id,status,created_at,reviewed_at,reviewer_id)
 VALUES(p_community,uid,'pending',now(),NULL,NULL)
 ON CONFLICT (community_id,user_id) DO UPDATE SET status='pending',created_at=now(),reviewed_at=NULL,reviewer_id=NULL
 WHERE public.community_join_requests.status='rejected';
 RETURN 'pending';
END $fn$;
REVOKE ALL ON FUNCTION public.sf_community_join(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_community_join(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_community_leave(p_community uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.community_members WHERE community_id=p_community AND user_id=uid AND role<>'owner';
 IF FOUND THEN RETURN true; END IF;
 DELETE FROM public.community_join_requests WHERE community_id=p_community AND user_id=uid AND status='pending';
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_community_leave(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_community_leave(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_community_review_join(p_community uuid,p_user uuid,p_approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid());
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.communities c WHERE c.id=p_community AND c.owner_id=actor)
 THEN RAISE EXCEPTION 'Community owner required' USING ERRCODE='42501'; END IF;
 UPDATE public.community_join_requests
 SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 reviewed_at=now(),reviewer_id=actor
 WHERE community_id=p_community AND user_id=p_user AND status='pending';
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_approve THEN
  INSERT INTO public.community_members(community_id,user_id,role) VALUES(p_community,p_user,'member')
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_community_review_join(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_community_review_join(uuid,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_community_set_moderator(p_community uuid,p_user uuid,p_moderator boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid());
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.communities c WHERE c.id=p_community AND c.owner_id=actor)
 THEN RAISE EXCEPTION 'Community owner required' USING ERRCODE='42501'; END IF;
 UPDATE public.community_members SET role=CASE WHEN p_moderator THEN 'moderator' ELSE 'member' END
 WHERE community_id=p_community AND user_id=p_user AND role IN ('moderator','member');
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_community_set_moderator(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_community_set_moderator(uuid,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_community_remove_member(p_community uuid,p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid()); actor_role text; target_role text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 SELECT role INTO actor_role FROM public.community_members WHERE community_id=p_community AND user_id=actor;
 SELECT role INTO target_role FROM public.community_members WHERE community_id=p_community AND user_id=p_user;
 IF actor_role NOT IN('owner','moderator') OR target_role IS NULL OR target_role='owner'
 OR (target_role='moderator' AND actor_role<>'owner') OR p_user=actor THEN
  RAISE EXCEPTION 'Insufficient moderation permissions' USING ERRCODE='42501'; END IF;
 DELETE FROM public.community_members WHERE community_id=p_community AND user_id=p_user;
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_community_remove_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_community_remove_member(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_community_post(p_community uuid,p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=(SELECT auth.uid()); post_id uuid;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.community_members
  WHERE community_id=p_community AND user_id=uid)
 THEN RAISE EXCEPTION 'Join the community before posting' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_content,''))) NOT BETWEEN 1 AND 280 THEN
  RAISE EXCEPTION 'Post must be 1–280 characters'; END IF;
 IF EXISTS(SELECT 1 FROM public.sf_account_restrictions r WHERE r.user_id=uid
  AND (r.status='banned' OR (r.status='suspended' AND r.expires_at>now()))) THEN
  RAISE EXCEPTION 'Account restricted' USING ERRCODE='42501'; END IF;
 INSERT INTO public.posts(author_id,content) VALUES(uid,btrim(p_content)) RETURNING id INTO post_id;
 INSERT INTO public.community_posts(community_id,post_id) VALUES(p_community,post_id);
 RETURN post_id;
END $fn$;
REVOKE ALL ON FUNCTION public.publish_community_post(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_community_post(uuid,text) TO authenticated;
