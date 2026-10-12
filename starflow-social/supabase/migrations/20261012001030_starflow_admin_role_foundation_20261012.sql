-- Starflow Admin Console: role grants and auditable administration.
CREATE TABLE IF NOT EXISTS public.sf_staff_roles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('founder','super_admin','official','senior_admin','moderator','verification_reviewer','support','analyst')),
 enabled boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sf_admin_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 80),
 target_user_id uuid,
 target_post_id uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_admin_activity_created_idx ON public.sf_admin_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS sf_admin_activity_actor_idx ON public.sf_admin_activity(actor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.sf_account_restrictions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
 expires_at timestamptz,
 reason text NOT NULL DEFAULT '',
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT sf_restriction_expiry CHECK (status <> 'suspended' OR expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sf_account_restrictions_status_idx ON public.sf_account_restrictions(status,expires_at);
CREATE TABLE IF NOT EXISTS public.sf_platform_settings (
 key text PRIMARY KEY CHECK(key IN ('posting_enabled','maintenance_mode','registration_enabled','homepage_title','public_support_email')),
 value jsonb NOT NULL,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sf_platform_settings(key,value) VALUES
 ('posting_enabled','true'::jsonb),
 ('maintenance_mode','false'::jsonb),
 ('registration_enabled','true'::jsonb)
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sf_platform_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 2000),
 published boolean NOT NULL DEFAULT false,
 author_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS sf_announcements_current_idx ON public.sf_platform_announcements(published,created_at DESC);
CREATE TABLE IF NOT EXISTS public.sf_moderated_posts (
 post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
 hidden boolean NOT NULL DEFAULT true,
 reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sf_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_admin_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_moderated_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_staff_roles,public.sf_admin_activity,public.sf_account_restrictions,public.sf_platform_settings,public.sf_platform_announcements,public.sf_moderated_posts FROM anon,authenticated;
GRANT SELECT ON public.sf_staff_roles,public.sf_admin_activity,public.sf_account_restrictions,public.sf_platform_settings,public.sf_platform_announcements,public.sf_moderated_posts TO authenticated;
GRANT SELECT ON public.sf_platform_announcements TO anon;
CREATE OR REPLACE FUNCTION public.sf_admin_has_permission(p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE r text;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RETURN false; END IF;
 SELECT sr.role INTO r FROM public.sf_staff_roles sr WHERE sr.user_id=(SELECT auth.uid()) AND sr.enabled=true;
 IF r IS NULL THEN RETURN false; END IF;
 IF r IN ('founder','super_admin') THEN RETURN true; END IF;
 IF p_permission='admin.access' THEN RETURN true; END IF;
 RETURN CASE r
  WHEN 'official' THEN p_permission IN ('announcements.manage','notices.send','verifications.manage','users.read','metrics.view','audit.view')
  WHEN 'senior_admin' THEN p_permission IN ('users.read','users.warn','users.restrict','content.moderate','reports.manage','verifications.manage','notices.send','announcements.manage','metrics.view','audit.view')
  WHEN 'moderator' THEN p_permission IN ('users.read','users.warn','content.moderate','reports.manage','metrics.view')
  WHEN 'verification_reviewer' THEN p_permission IN ('users.read','verifications.manage')
  WHEN 'support' THEN p_permission IN ('users.read','users.warn','reports.read','notices.send')
  WHEN 'analyst' THEN p_permission IN ('metrics.view')
  ELSE false END;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_has_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_has_permission(text) TO authenticated;
CREATE POLICY sf_staff_self_and_managers ON public.sf_staff_roles FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (SELECT public.sf_admin_has_permission('staff.manage')));
CREATE POLICY sf_admin_activity_read ON public.sf_admin_activity FOR SELECT TO authenticated
 USING ((SELECT public.sf_admin_has_permission('audit.view')));
CREATE POLICY sf_restriction_read ON public.sf_account_restrictions FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (SELECT public.sf_admin_has_permission('users.read')));
CREATE POLICY sf_settings_admin_read ON public.sf_platform_settings FOR SELECT TO authenticated
 USING ((SELECT public.sf_admin_has_permission('settings.manage')));
CREATE POLICY sf_announcements_public_read ON public.sf_platform_announcements FOR SELECT TO anon,authenticated
 USING ((published AND (expires_at IS NULL OR expires_at>now())) OR (SELECT public.sf_admin_has_permission('announcements.manage')));
CREATE POLICY sf_moderated_posts_admin_read ON public.sf_moderated_posts FOR SELECT TO authenticated
 USING ((SELECT public.sf_admin_has_permission('content.moderate')));
-- Bootstrap from explicitly recognized legacy administrator accounts; no generated UUIDs.
INSERT INTO public.sf_staff_roles(user_id,role)
 SELECT p.id,CASE WHEN p.handle='wei' THEN 'founder' ELSE 'official' END
 FROM public.profiles p JOIN public.platform_admins a ON a.user_id=p.id
 WHERE p.handle IN ('wei','starflow')
ON CONFLICT(user_id) DO NOTHING;
