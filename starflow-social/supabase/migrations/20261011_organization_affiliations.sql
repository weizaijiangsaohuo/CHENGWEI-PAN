-- Starflow organization affiliations, 2026-10-11.
-- Additive migration only: no existing profile, verification or notification removed.
CREATE TABLE IF NOT EXISTS public.organization_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  affiliate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  affiliate_kind text NOT NULL DEFAULT 'individual' CHECK (affiliate_kind IN ('individual','organization')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','revoked')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliation_not_self CHECK (org_id <> affiliate_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_org_affiliate ON public.organization_affiliations(org_id,affiliate_id) WHERE status IN ('pending','active');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_affiliate_account ON public.organization_affiliations(affiliate_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_org_affiliation_status ON public.organization_affiliations(org_id,status,invited_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_invites ON public.organization_affiliations(affiliate_id,status,invited_at DESC);
ALTER TABLE public.organization_affiliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sf_read_affiliations ON public.organization_affiliations;
CREATE POLICY sf_read_affiliations ON public.organization_affiliations FOR SELECT TO authenticated
  USING (status='active' OR org_id=(SELECT auth.uid()) OR affiliate_id=(SELECT auth.uid()));
GRANT SELECT ON public.organization_affiliations TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.organization_affiliations FROM anon,authenticated;

-- Preserve all existing notification kinds and existing notifications.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'follow','like','repost','reply','mention',
  'verification_approved','verification_rejected','verification_revoked',
  'account_warning','account_violation','account_restored',
  'affiliation_invite','affiliation_accepted','affiliation_activated',
  'affiliation_declined','affiliation_removed'
));

CREATE OR REPLACE FUNCTION public.sf_invite_organization_affiliate(p_handle text,p_type text DEFAULT 'individual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE owner_id uuid := auth.uid(); target_id uuid; request_id uuid; org_label text;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION '请先登录。'; END IF;
  IF p_type NOT IN ('individual','organization') THEN RAISE EXCEPTION '不支持的附属账号类型。'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications v
    WHERE v.profile_id=owner_id AND v.status='approved' AND v.verification_type IN ('gold','gray')) THEN
    RAISE EXCEPTION '只有已认证的组织账号可以邀请附属账号。';
  END IF;
  SELECT id INTO target_id FROM public.profiles WHERE lower(handle)=lower(ltrim(btrim(p_handle),'@'));
  IF target_id IS NULL THEN RAISE EXCEPTION '找不到这个用户名。'; END IF;
  IF owner_id=target_id THEN RAISE EXCEPTION '不能邀请自己的账号。'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_affiliations
    WHERE org_id=owner_id AND affiliate_id=target_id AND status IN ('pending','active')) THEN
    RAISE EXCEPTION '该账号已有待处理或生效中的邀请。';
  END IF;
  IF (SELECT count(*) FROM public.organization_affiliations WHERE org_id=owner_id AND status IN ('pending','active'))>=300 THEN
    RAISE EXCEPTION '当前邀请数量已达上限。';
  END IF;
  SELECT display_name INTO org_label FROM public.profiles WHERE id=owner_id;
  INSERT INTO public.organization_affiliations(org_id,affiliate_id,invited_by,affiliate_kind)
  VALUES(owner_id,target_id,owner_id,p_type) RETURNING id INTO request_id;
  INSERT INTO public.notifications(recipient_id,actor_id,kind,message)
  VALUES(target_id,owner_id,'affiliation_invite',left(coalesce(org_label,'官方组织') || ' 邀请你关联为 Starflow 官方附属账号。请前往附属账号中心接受或拒绝。',1200));
  RETURN request_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.sf_respond_organization_affiliation(p_affiliation uuid,p_accept boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE viewer uuid := auth.uid(); row_data public.organization_affiliations%ROWTYPE;
        label text;
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION '请先登录。'; END IF;
  SELECT * INTO row_data FROM public.organization_affiliations WHERE id=p_affiliation FOR UPDATE;
  IF NOT FOUND OR row_data.affiliate_id<>viewer OR row_data.status<>'pending' THEN
    RAISE EXCEPTION '邀请不存在或已处理。';
  END IF;
  IF p_accept THEN
    IF NOT EXISTS (SELECT 1 FROM public.account_verifications
      WHERE profile_id=row_data.org_id AND status='approved' AND verification_type IN ('gold','gray')) THEN
      RAISE EXCEPTION '邀请组织的认证已失效，不能接受。';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_affiliations
      WHERE affiliate_id=viewer AND status='active') THEN
      RAISE EXCEPTION '该账号已关联一个官方组织，请先解除已有关系。';
    END IF;
    UPDATE public.organization_affiliations SET status='active',responded_at=now(),updated_at=now() WHERE id=row_data.id;
    SELECT display_name INTO label FROM public.profiles WHERE id=viewer;
    INSERT INTO public.notifications(recipient_id,actor_id,kind,message)
      VALUES(row_data.org_id,viewer,'affiliation_accepted',left(coalesce(label,'附属账号')||' 已接受你的官方附属账号邀请。',1200));
    INSERT INTO public.notifications(recipient_id,actor_id,kind,message)
      VALUES(viewer,row_data.org_id,'affiliation_activated','附属账号关联已生效。你的用户名旁将展示所属组织徽章。');
  ELSE
    UPDATE public.organization_affiliations SET status='declined',responded_at=now(),updated_at=now() WHERE id=row_data.id;
    INSERT INTO public.notifications(recipient_id,actor_id,kind,message)
      VALUES(row_data.org_id,viewer,'affiliation_declined','邀请已被拒绝。');
  END IF;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.sf_remove_organization_affiliation(p_affiliation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE viewer uuid := auth.uid(); row_data public.organization_affiliations%ROWTYPE; other_id uuid;
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION '请先登录。'; END IF;
  SELECT * INTO row_data FROM public.organization_affiliations WHERE id=p_affiliation FOR UPDATE;
  IF NOT FOUND OR row_data.status NOT IN ('pending','active')
    OR (viewer<>row_data.org_id AND viewer<>row_data.affiliate_id) THEN
    RAISE EXCEPTION '无权解除此关联。';
  END IF;
  UPDATE public.organization_affiliations SET status='revoked',updated_at=now() WHERE id=row_data.id;
  other_id := CASE WHEN viewer=row_data.org_id THEN row_data.affiliate_id ELSE row_data.org_id END;
  INSERT INTO public.notifications(recipient_id,actor_id,kind,message)
  VALUES(other_id,viewer,'affiliation_removed','Starflow 组织附属关系已解除，关联徽章不再展示。');
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_invite_organization_affiliate(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sf_respond_organization_affiliation(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sf_remove_organization_affiliation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_invite_organization_affiliate(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sf_respond_organization_affiliation(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sf_remove_organization_affiliation(uuid) TO authenticated;
