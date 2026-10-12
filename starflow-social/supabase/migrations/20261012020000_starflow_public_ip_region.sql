-- Starflow public coarse IP-region program. Staged rollout: disabled until notice + acceptance.
-- Nothing in this migration captures or exposes the actual IP address.
CREATE TABLE IF NOT EXISTS public.sf_ip_region_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sf_ip_region_policy(id,enabled) VALUES(true,false) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.sf_ip_region_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sf_ip_region_policy_read ON public.sf_ip_region_policy;
CREATE POLICY sf_ip_region_policy_read ON public.sf_ip_region_policy FOR SELECT TO anon,authenticated USING(true);
REVOKE ALL ON public.sf_ip_region_policy FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,enabled) ON public.sf_ip_region_policy TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.sf_public_ip_region (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$' AND country_code NOT IN ('XX','ZZ','T1')),
 subdivision_code text CHECK(subdivision_code IS NULL OR subdivision_code ~ '^[A-Z]{2}$'),
 source text NOT NULL DEFAULT 'auto' CHECK(source IN ('auto','reviewed')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT sf_ip_region_subdivision_only_cn CHECK(country_code='CN' OR subdivision_code IS NULL)
);
CREATE INDEX IF NOT EXISTS sf_public_ip_region_updated_idx ON public.sf_public_ip_region(updated_at DESC);
ALTER TABLE public.sf_public_ip_region ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sf_public_ip_region_read ON public.sf_public_ip_region;
-- A public region can be read only after site policy is explicitly enabled.
CREATE POLICY sf_public_ip_region_read ON public.sf_public_ip_region
 FOR SELECT TO anon,authenticated
 USING ((SELECT enabled FROM public.sf_ip_region_policy WHERE id=true));
REVOKE ALL ON public.sf_public_ip_region FROM PUBLIC,anon,authenticated;
GRANT SELECT(user_id,country_code,subdivision_code,source,updated_at) ON public.sf_public_ip_region TO anon,authenticated;

-- Server-only automatic country/province write. The Cloudflare Worker validates a JWT
-- and provides region metadata; the client cannot submit its own country/IP.
CREATE OR REPLACE FUNCTION public.sf_record_auto_ip_region(
 p_user_id uuid,p_country_code text,p_subdivision_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE country text := upper(trim(p_country_code));
        division text := nullif(upper(trim(coalesce(p_subdivision_code,''))),'');
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sf_ip_region_policy WHERE id=true AND enabled=true)
 THEN RETURN false; END IF;
 IF country IS NULL OR country !~ '^[A-Z]{2}
 IF country <> 'CN' THEN division:=NULL; END IF;
 IF country='CN' AND division IS NOT NULL AND division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
 ]) THEN division:=NULL; END IF;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'auto',now())
 ON CONFLICT (user_id) DO UPDATE SET
 country_code=EXCLUDED.country_code,
 subdivision_code=EXCLUDED.subdivision_code,
 updated_at=now()
 WHERE public.sf_public_ip_region.source='auto';
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) TO service_role;

-- Audited correction (not a fake automatic IP detection). Only founder/super-admin.
CREATE OR REPLACE FUNCTION public.sf_admin_correct_ip_region(
 p_user_id uuid,p_country_code text,p_subdivision_code text,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); old_value jsonb; role_name text;
        country text:=upper(trim(p_country_code));
        division text:=nullif(upper(trim(coalesce(p_subdivision_code,''))),'');
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN ('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,''))) < 10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Correction reason must be 10-500 characters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
  RAISE EXCEPTION 'Account not found'; END IF;
 IF country IS NULL OR country !~ '^[A-Z]{2}
  RAISE EXCEPTION 'Invalid country code'; END IF;
 IF country='CN' THEN
  IF division IS NULL OR division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
  ]) THEN RAISE EXCEPTION 'Invalid CN province code'; END IF;
 ELSIF division IS NOT NULL THEN RAISE EXCEPTION 'Non-CN region must be country-level'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
  INTO old_value FROM public.sf_public_ip_region WHERE user_id=p_user_id FOR UPDATE;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'reviewed',now())
 ON CONFLICT(user_id) DO UPDATE SET country_code=EXCLUDED.country_code,
  subdivision_code=EXCLUDED.subdivision_code,source='reviewed',updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.correct',p_user_id,
  jsonb_build_object('before',old_value,'after',jsonb_build_object('country',country,'subdivision',division),
   'reason',trim(p_reason),'display_source','reviewed'));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) TO authenticated;

-- Allow returning to automatic detection (the old manually corrected location
-- is erased, not misrepresented as an automatic IP lookup).
CREATE OR REPLACE FUNCTION public.sf_admin_clear_ip_region_override(
 p_user_id uuid,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); role_name text; old_value jsonb;
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,'')))<10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Reason must be 10-500 characters'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
 INTO old_value FROM public.sf_public_ip_region
 WHERE user_id=p_user_id AND source='reviewed' FOR UPDATE;
 IF old_value IS NULL THEN RAISE EXCEPTION 'No manual correction exists'; END IF;
 DELETE FROM public.sf_public_ip_region WHERE user_id=p_user_id AND source='reviewed';
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.reset',p_user_id,jsonb_build_object('before',old_value,'reason',trim(p_reason)));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) TO authenticated;

-- ACTION REQUIRED FOR LIVE ROLLOUT (not executed by migration):
-- 1) Publicly announce the coarse-region policy and update privacy/terms.
-- 2) Bind SUPABASE_SERVICE_ROLE_KEY in Cloudflare Worker Secrets.
-- 3) Verify the migrations and role checks in staging.
-- 4) ONLY THEN run: UPDATE public.sf_ip_region_policy SET enabled=true,updated_at=now() WHERE id=true;
-- 5) Active authenticated sessions will record coarse regions; dormant users remain unknown.
 OR country IN ('XX','ZZ','T1') THEN RETURN false; END IF;
 IF country <> 'CN' THEN division:=NULL; END IF;
 IF country='CN' AND division IS NOT NULL AND division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
 ]) THEN division:=NULL; END IF;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'auto',now())
 ON CONFLICT (user_id) DO UPDATE SET
 country_code=EXCLUDED.country_code,
 subdivision_code=EXCLUDED.subdivision_code,
 updated_at=now()
 WHERE public.sf_public_ip_region.source='auto';
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) TO service_role;

-- Audited correction (not a fake automatic IP detection). Only founder/super-admin.
CREATE OR REPLACE FUNCTION public.sf_admin_correct_ip_region(
 p_user_id uuid,p_country_code text,p_subdivision_code text,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); old_value jsonb; role_name text;
        country text:=upper(trim(p_country_code));
        division text:=nullif(upper(trim(coalesce(p_subdivision_code,''))),'');
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN ('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,''))) < 10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Correction reason must be 10-500 characters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
  RAISE EXCEPTION 'Account not found'; END IF;
 IF country !~ '^[A-Z]{2}$' OR country IN('XX','ZZ','T1') THEN
  RAISE EXCEPTION 'Invalid country code'; END IF;
 IF country='CN' THEN
  IF division IS NULL OR division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
  ]) THEN RAISE EXCEPTION 'Invalid CN province code'; END IF;
 ELSIF division IS NOT NULL THEN RAISE EXCEPTION 'Non-CN region must be country-level'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
  INTO old_value FROM public.sf_public_ip_region WHERE user_id=p_user_id FOR UPDATE;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'reviewed',now())
 ON CONFLICT(user_id) DO UPDATE SET country_code=EXCLUDED.country_code,
  subdivision_code=EXCLUDED.subdivision_code,source='reviewed',updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.correct',p_user_id,
  jsonb_build_object('before',old_value,'after',jsonb_build_object('country',country,'subdivision',division),
   'reason',trim(p_reason),'display_source','reviewed'));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) TO authenticated;

-- Allow returning to automatic detection (the old manually corrected location
-- is erased, not misrepresented as an automatic IP lookup).
CREATE OR REPLACE FUNCTION public.sf_admin_clear_ip_region_override(
 p_user_id uuid,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); role_name text; old_value jsonb;
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,'')))<10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Reason must be 10-500 characters'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
 INTO old_value FROM public.sf_public_ip_region
 WHERE user_id=p_user_id AND source='reviewed' FOR UPDATE;
 IF old_value IS NULL THEN RAISE EXCEPTION 'No manual correction exists'; END IF;
 DELETE FROM public.sf_public_ip_region WHERE user_id=p_user_id AND source='reviewed';
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.reset',p_user_id,jsonb_build_object('before',old_value,'reason',trim(p_reason)));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) TO authenticated;

-- ACTION REQUIRED FOR LIVE ROLLOUT (not executed by migration):
-- 1) Publicly announce the coarse-region policy and update privacy/terms.
-- 2) Bind SUPABASE_SERVICE_ROLE_KEY in Cloudflare Worker Secrets.
-- 3) Verify the migrations and role checks in staging.
-- 4) ONLY THEN run: UPDATE public.sf_ip_region_policy SET enabled=true,updated_at=now() WHERE id=true;
-- 5) Active authenticated sessions will record coarse regions; dormant users remain unknown.
 OR country IN('XX','ZZ','T1') THEN
  RAISE EXCEPTION 'Invalid country code'; END IF;
 IF country='CN' THEN
  IF division IS NULL OR division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
  ]) THEN RAISE EXCEPTION 'Invalid CN province code'; END IF;
 ELSIF division IS NOT NULL THEN RAISE EXCEPTION 'Non-CN region must be country-level'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
  INTO old_value FROM public.sf_public_ip_region WHERE user_id=p_user_id FOR UPDATE;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'reviewed',now())
 ON CONFLICT(user_id) DO UPDATE SET country_code=EXCLUDED.country_code,
  subdivision_code=EXCLUDED.subdivision_code,source='reviewed',updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.correct',p_user_id,
  jsonb_build_object('before',old_value,'after',jsonb_build_object('country',country,'subdivision',division),
   'reason',trim(p_reason),'display_source','reviewed'));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) TO authenticated;

-- Allow returning to automatic detection (the old manually corrected location
-- is erased, not misrepresented as an automatic IP lookup).
CREATE OR REPLACE FUNCTION public.sf_admin_clear_ip_region_override(
 p_user_id uuid,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); role_name text; old_value jsonb;
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,'')))<10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Reason must be 10-500 characters'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
 INTO old_value FROM public.sf_public_ip_region
 WHERE user_id=p_user_id AND source='reviewed' FOR UPDATE;
 IF old_value IS NULL THEN RAISE EXCEPTION 'No manual correction exists'; END IF;
 DELETE FROM public.sf_public_ip_region WHERE user_id=p_user_id AND source='reviewed';
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.reset',p_user_id,jsonb_build_object('before',old_value,'reason',trim(p_reason)));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) TO authenticated;

-- ACTION REQUIRED FOR LIVE ROLLOUT (not executed by migration):
-- 1) Publicly announce the coarse-region policy and update privacy/terms.
-- 2) Bind SUPABASE_SERVICE_ROLE_KEY in Cloudflare Worker Secrets.
-- 3) Verify the migrations and role checks in staging.
-- 4) ONLY THEN run: UPDATE public.sf_ip_region_policy SET enabled=true,updated_at=now() WHERE id=true;
-- 5) Active authenticated sessions will record coarse regions; dormant users remain unknown.
 OR country IN ('XX','ZZ','T1') THEN RETURN false; END IF;
 IF country <> 'CN' THEN division:=NULL; END IF;
 IF country='CN' AND division IS NOT NULL AND division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
 ]) THEN division:=NULL; END IF;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'auto',now())
 ON CONFLICT (user_id) DO UPDATE SET
 country_code=EXCLUDED.country_code,
 subdivision_code=EXCLUDED.subdivision_code,
 updated_at=now()
 WHERE public.sf_public_ip_region.source='auto';
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) TO service_role;

-- Audited correction (not a fake automatic IP detection). Only founder/super-admin.
CREATE OR REPLACE FUNCTION public.sf_admin_correct_ip_region(
 p_user_id uuid,p_country_code text,p_subdivision_code text,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); old_value jsonb; role_name text;
        country text:=upper(trim(p_country_code));
        division text:=nullif(upper(trim(coalesce(p_subdivision_code,''))),'');
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN ('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,''))) < 10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Correction reason must be 10-500 characters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
  RAISE EXCEPTION 'Account not found'; END IF;
 IF country !~ '^[A-Z]{2}$' OR country IN('XX','ZZ','T1') THEN
  RAISE EXCEPTION 'Invalid country code'; END IF;
 IF country='CN' THEN
  IF division IS NULL OR division <> ALL(ARRAY[
  'AH','BJ','CQ','FJ','GD','GS','GX','GZ','HA','HB','HE','HI','HL','HN','JL','JS','JX',
  'LN','NM','NX','QH','SC','SD','SH','SN','SX','TJ','XJ','XZ','YN','ZJ'
  ]) THEN RAISE EXCEPTION 'Invalid CN province code'; END IF;
 ELSIF division IS NOT NULL THEN RAISE EXCEPTION 'Non-CN region must be country-level'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
  INTO old_value FROM public.sf_public_ip_region WHERE user_id=p_user_id FOR UPDATE;
 INSERT INTO public.sf_public_ip_region(user_id,country_code,subdivision_code,source,updated_at)
 VALUES(p_user_id,country,division,'reviewed',now())
 ON CONFLICT(user_id) DO UPDATE SET country_code=EXCLUDED.country_code,
  subdivision_code=EXCLUDED.subdivision_code,source='reviewed',updated_at=now();
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.correct',p_user_id,
  jsonb_build_object('before',old_value,'after',jsonb_build_object('country',country,'subdivision',division),
   'reason',trim(p_reason),'display_source','reviewed'));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) TO authenticated;

-- Allow returning to automatic detection (the old manually corrected location
-- is erased, not misrepresented as an automatic IP lookup).
CREATE OR REPLACE FUNCTION public.sf_admin_clear_ip_region_override(
 p_user_id uuid,p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); role_name text; old_value jsonb;
BEGIN
 SELECT role INTO role_name FROM public.sf_staff_roles WHERE user_id=actor AND enabled=true;
 IF role_name IS NULL OR role_name NOT IN('founder','super_admin') THEN
  RAISE EXCEPTION 'Insufficient admin permission' USING ERRCODE='42501'; END IF;
 IF char_length(trim(coalesce(p_reason,'')))<10 OR char_length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Reason must be 10-500 characters'; END IF;
 SELECT jsonb_build_object('country',country_code,'subdivision',subdivision_code,'source',source)
 INTO old_value FROM public.sf_public_ip_region
 WHERE user_id=p_user_id AND source='reviewed' FOR UPDATE;
 IF old_value IS NULL THEN RAISE EXCEPTION 'No manual correction exists'; END IF;
 DELETE FROM public.sf_public_ip_region WHERE user_id=p_user_id AND source='reviewed';
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'ip_region.reset',p_user_id,jsonb_build_object('before',old_value,'reason',trim(p_reason)));
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_admin_clear_ip_region_override(uuid,text) TO authenticated;

-- ACTION REQUIRED FOR LIVE ROLLOUT (not executed by migration):
-- 1) Publicly announce the coarse-region policy and update privacy/terms.
-- 2) Bind SUPABASE_SERVICE_ROLE_KEY in Cloudflare Worker Secrets.
-- 3) Verify the migrations and role checks in staging.
-- 4) ONLY THEN run: UPDATE public.sf_ip_region_policy SET enabled=true,updated_at=now() WHERE id=true;
-- 5) Active authenticated sessions will record coarse regions; dormant users remain unknown.
