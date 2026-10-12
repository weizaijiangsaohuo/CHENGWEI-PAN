-- Resolve anonymous public-announcement reads without exposing admin-only draft notices.
-- The old combined policy called a privileged RPC for anon visitors, causing 42501.
DROP POLICY IF EXISTS sf_announcements_public_read ON public.sf_platform_announcements;
DROP POLICY IF EXISTS sf_announcements_public_visible ON public.sf_platform_announcements;
DROP POLICY IF EXISTS sf_announcements_admin_read ON public.sf_platform_announcements;
CREATE POLICY sf_announcements_public_visible ON public.sf_platform_announcements
 FOR SELECT TO anon, authenticated
 USING (published = true AND (expires_at IS NULL OR expires_at > now()));
CREATE POLICY sf_announcements_admin_read ON public.sf_platform_announcements
 FOR SELECT TO authenticated
 USING ((SELECT public.sf_admin_has_permission('announcements.manage')));
