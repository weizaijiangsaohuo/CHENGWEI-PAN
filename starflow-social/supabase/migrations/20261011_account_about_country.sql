-- Additive account transparency data. No existing profile, verification or content is removed.
-- Users opt in before country is collected; we never store a raw IP address.
CREATE TABLE IF NOT EXISTS public.account_ip_country (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
 last_seen_at timestamptz,
 is_public boolean NOT NULL DEFAULT false
);
INSERT INTO public.account_ip_country(user_id)
 SELECT id FROM public.profiles ON CONFLICT(user_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.sf_init_account_ip_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 INSERT INTO public.account_ip_country(user_id) VALUES (NEW.id) ON CONFLICT(user_id) DO NOTHING;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sf_init_account_ip_country_trigger ON public.profiles;
CREATE TRIGGER sf_init_account_ip_country_trigger AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sf_init_account_ip_country();
ALTER TABLE public.account_ip_country ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sf_about_country_read ON public.account_ip_country;
CREATE POLICY sf_about_country_read ON public.account_ip_country FOR SELECT TO anon,authenticated
USING(is_public=true OR user_id=(SELECT auth.uid()));
REVOKE ALL ON public.account_ip_country FROM anon,authenticated;
GRANT SELECT ON public.account_ip_country TO anon,authenticated;
-- Privacy changes only through a scoped SECURITY DEFINER function. The authenticated
-- user cannot directly change country_code or last_seen_at.
CREATE OR REPLACE FUNCTION public.sf_set_account_country_public(p_public boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
 INSERT INTO public.account_ip_country(user_id,is_public) VALUES (auth.uid(),p_public)
 ON CONFLICT(user_id) DO UPDATE SET is_public=EXCLUDED.is_public;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.sf_set_account_country_public(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_set_account_country_public(boolean) TO authenticated;

-- Count only handle changes after this migration is installed. Old history
-- cannot be reconstructed and old usernames are not exposed to visitors.
CREATE TABLE IF NOT EXISTS public.account_handle_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_account_handle_changes_account ON public.account_handle_changes(account_id,changed_at DESC);
ALTER TABLE public.account_handle_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_handle_changes FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.sf_log_handle_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF OLD.handle IS DISTINCT FROM NEW.handle THEN
  INSERT INTO public.account_handle_changes(account_id) VALUES(NEW.id);
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS sf_log_handle_change_trigger ON public.profiles;
CREATE TRIGGER sf_log_handle_change_trigger AFTER UPDATE OF handle ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sf_log_handle_change();
CREATE OR REPLACE FUNCTION public.sf_account_handle_history(p_account_id uuid)
RETURNS TABLE(total_changes bigint,last_changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT count(*),max(changed_at) FROM public.account_handle_changes WHERE account_id=p_account_id
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_account_id);
$f$;
REVOKE ALL ON FUNCTION public.sf_account_handle_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sf_account_handle_history(uuid) TO anon,authenticated;

-- Public visibility only for ACTIVE official affiliations (not private invites).
DROP POLICY IF EXISTS sf_read_affiliations ON public.organization_affiliations;
CREATE POLICY sf_read_affiliations ON public.organization_affiliations FOR SELECT TO anon,authenticated
 USING(status='active' OR org_id=(SELECT auth.uid()) OR affiliate_id=(SELECT auth.uid()));
GRANT SELECT ON public.organization_affiliations TO anon;
