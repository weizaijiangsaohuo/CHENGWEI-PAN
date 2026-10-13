-- Creator collaboration contracts: private invitations, immutable terms, bilateral acknowledgement.
-- A typed-name acknowledgement and audit trail do not in themselves prove a legally certified e-signature.
CREATE TABLE IF NOT EXISTS public.sf_creator_contracts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 invited_by uuid NOT NULL REFERENCES auth.users(id),
 source_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 8 AND 120),
 platform_legal_entity text NOT NULL CHECK(char_length(btrim(platform_legal_entity)) BETWEEN 2 AND 160),
 agreement_body text NOT NULL CHECK(char_length(btrim(agreement_body)) BETWEEN 250 AND 16000),
 selection_note text NOT NULL CHECK(char_length(btrim(selection_note)) BETWEEN 10 AND 500),
 agreement_hash text NOT NULL CHECK(agreement_hash ~ '^[a-f0-9]{64}$'),
 template_version text NOT NULL DEFAULT 'individual-v1',
 status text NOT NULL DEFAULT 'invited'
  CHECK(status IN('invited','creator_signed','completed','declined','withdrawn')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 creator_signature text CHECK(creator_signature IS NULL OR char_length(btrim(creator_signature)) BETWEEN 2 AND 100),
 creator_signed_at timestamptz,
 platform_signer_id uuid REFERENCES auth.users(id),
 platform_signature text CHECK(platform_signature IS NULL OR char_length(btrim(platform_signature)) BETWEEN 2 AND 100),
 platform_signed_at timestamptz,
 completed_at timestamptz,
 CHECK((creator_signature IS NULL)=(creator_signed_at IS NULL)),
 CHECK((platform_signature IS NULL)=(platform_signed_at IS NULL)),
 CHECK((status='completed')=(completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sf_creator_contracts_owner ON public.sf_creator_contracts(creator_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sf_creator_contracts_admin ON public.sf_creator_contracts(status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.sf_creator_contract_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id uuid NOT NULL REFERENCES public.sf_creator_contracts(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 event_kind text NOT NULL CHECK(event_kind IN('invited','viewed','creator_signed','platform_signed','declined','withdrawn')),
 agreement_hash text NOT NULL CHECK(agreement_hash ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 event_details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sf_creator_contract_event_history ON public.sf_creator_contract_events(contract_id,occurred_at ASC);
ALTER TABLE public.sf_creator_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_creator_contract_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_creator_contracts,public.sf_creator_contract_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sf_creator_contracts,public.sf_creator_contract_events TO authenticated;
DROP POLICY IF EXISTS sf_contracts_private_read ON public.sf_creator_contracts;
CREATE POLICY sf_contracts_private_read ON public.sf_creator_contracts FOR SELECT TO authenticated
 USING(creator_id=(SELECT auth.uid()) OR EXISTS(
 SELECT 1 FROM public.sf_staff_roles sr WHERE sr.user_id=(SELECT auth.uid())
 AND sr.enabled=true AND sr.role IN ('founder','super_admin','official','senior_admin')
 ));
DROP POLICY IF EXISTS sf_contract_events_private_read ON public.sf_creator_contract_events;
CREATE POLICY sf_contract_events_private_read ON public.sf_creator_contract_events FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.sf_creator_contracts c WHERE c.id=contract_id));

-- Defensive safeguard: contract terms may never be rewritten after issuance, including by privileged tooling.
CREATE OR REPLACE FUNCTION public.sf_prevent_creator_contract_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF OLD.creator_id IS DISTINCT FROM NEW.creator_id
 OR OLD.title IS DISTINCT FROM NEW.title
 OR OLD.platform_legal_entity IS DISTINCT FROM NEW.platform_legal_entity
 OR OLD.agreement_body IS DISTINCT FROM NEW.agreement_body
 OR OLD.agreement_hash IS DISTINCT FROM NEW.agreement_hash
 OR OLD.template_version IS DISTINCT FROM NEW.template_version
 OR OLD.source_post_id IS DISTINCT FROM NEW.source_post_id
 OR OLD.selection_note IS DISTINCT FROM NEW.selection_note
 OR OLD.invited_by IS DISTINCT FROM NEW.invited_by
 OR OLD.created_at IS DISTINCT FROM NEW.created_at
 OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
  RAISE EXCEPTION 'Issued agreement text and identity are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_prevent_creator_contract_rewrite() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sf_prevent_creator_contract_rewrite_trg ON public.sf_creator_contracts;
CREATE TRIGGER sf_prevent_creator_contract_rewrite_trg BEFORE UPDATE ON public.sf_creator_contracts
 FOR EACH ROW EXECUTE FUNCTION public.sf_prevent_creator_contract_rewrite();

-- Screening: actual public-account post, like and follower counts; manual discretion remains mandatory.
CREATE OR REPLACE FUNCTION public.sf_contract_candidates(p_query text DEFAULT '')
RETURNS TABLE(user_id uuid,handle text,display_name text,posts_90d bigint,likes_90d bigint,followers bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sf_staff_roles r WHERE r.user_id=(SELECT auth.uid())
 AND r.enabled AND r.role IN('founder','super_admin','official','senior_admin')) THEN
  RAISE EXCEPTION 'Authorized platform staff only' USING ERRCODE='42501'; END IF;
 IF char_length(coalesce(p_query,''))>50 THEN RAISE EXCEPTION 'Search too long'; END IF;
 RETURN QUERY SELECT p.id,p.handle,p.display_name,
  (SELECT count(*) FROM public.posts x WHERE x.author_id=p.id AND x.parent_id IS NULL AND x.created_at>now()-interval '90 days') AS posts_90d,
  (SELECT count(*) FROM public.likes l JOIN public.posts x ON x.id=l.post_id WHERE x.author_id=p.id AND x.created_at>now()-interval '90 days') AS likes_90d,
  (SELECT count(*) FROM public.follows f WHERE f.following_id=p.id) AS followers
 FROM public.profiles p
 WHERE (p.handle ILIKE '%'||replace(replace(coalesce(p_query,''),'%','\\%'),'_','\\_')||'%' ESCAPE '\\'
  OR p.display_name ILIKE '%'||replace(replace(coalesce(p_query,''),'%','\\%'),'_','\\_')||'%' ESCAPE '\\')
 ORDER BY followers DESC,likes_90d DESC,posts_90d DESC,p.created_at DESC LIMIT 50;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_contract_candidates(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_contract_candidates(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_contract_invite(
 p_creator uuid,p_title text,p_entity text,p_terms text,p_reason text,
 p_source_post uuid DEFAULT NULL,p_expiry_days integer DEFAULT 14
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid()); contract_id uuid; fingerprint text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.sf_staff_roles r WHERE r.user_id=actor
 AND r.enabled AND r.role IN('founder','super_admin')) THEN
 RAISE EXCEPTION 'Founder or super admin must authorize contract invitations' USING ERRCODE='42501'; END IF;
 IF p_creator IS NULL OR p_creator=actor OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_creator) THEN
  RAISE EXCEPTION 'Invalid creator'; END IF;
 IF char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 8 AND 120
 OR char_length(btrim(coalesce(p_entity,''))) NOT BETWEEN 2 AND 160
 OR char_length(btrim(coalesce(p_terms,''))) NOT BETWEEN 250 AND 16000
 OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Title, legal party, agreement (250-16000 chars) and selection reason required'; END IF;
 IF p_expiry_days NOT BETWEEN 3 AND 30 THEN RAISE EXCEPTION 'Expiry must be 3-30 days'; END IF;
 IF p_source_post IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.posts WHERE id=p_source_post AND author_id=p_creator AND parent_id IS NULL
 ) THEN RAISE EXCEPTION 'Selected work must belong to creator'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_creator::text,84421));
 IF EXISTS(SELECT 1 FROM public.sf_creator_contracts WHERE creator_id=p_creator
  AND status IN('invited','creator_signed')) THEN
  RAISE EXCEPTION 'This creator already has an open invitation'; END IF;
 IF (SELECT count(*) FROM public.sf_creator_contracts WHERE invited_by=actor
 AND created_at>now()-interval '24 hours')>=30 THEN RAISE EXCEPTION 'Invitation rate limit exceeded'; END IF;
 fingerprint:=encode(extensions.digest(convert_to(
  jsonb_build_object('creator',p_creator,'title',btrim(p_title),'entity',btrim(p_entity),
   'terms',btrim(p_terms),'work',p_source_post,'version','individual-v1')::text,'UTF8'),'sha256'),'hex');
 INSERT INTO public.sf_creator_contracts(creator_id,invited_by,source_post_id,title,platform_legal_entity,
  agreement_body,selection_note,agreement_hash,expires_at)
 VALUES(p_creator,actor,p_source_post,btrim(p_title),btrim(p_entity),btrim(p_terms),
  btrim(p_reason),fingerprint,now()+make_interval(days=>p_expiry_days)) RETURNING id INTO contract_id;
 INSERT INTO public.sf_creator_contract_events(contract_id,actor_id,event_kind,agreement_hash)
 VALUES(contract_id,actor,'invited',fingerprint);
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'contracts.invite',p_creator,jsonb_build_object('contract_id',contract_id,'hash',fingerprint));
 INSERT INTO public.notifications(recipient_id,actor_id,kind,post_id,message)
 VALUES(p_creator,actor,'system_announcement',NULL,'星流向你发送了一份创作者合作签约邀请，请进入「我的签约」审阅后自主决定是否签署。');
 RETURN contract_id;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_contract_invite(uuid,text,text,text,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_contract_invite(uuid,text,text,text,text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_contract_creator_decide(
 p_id uuid,p_action text,p_legal_name text DEFAULT NULL,p_agreed boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid()); item public.sf_creator_contracts%ROWTYPE;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Login required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.sf_creator_contracts WHERE id=p_id AND creator_id=actor FOR UPDATE;
 IF NOT FOUND OR item.status<>'invited' THEN RAISE EXCEPTION 'No active invitation'; END IF;
 IF p_action NOT IN ('sign','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF p_action='sign' THEN
  IF item.expires_at<=now() THEN RAISE EXCEPTION 'Invitation has expired'; END IF;
  IF p_agreed IS DISTINCT FROM true OR char_length(btrim(coalesce(p_legal_name,''))) NOT BETWEEN 2 AND 100 THEN
   RAISE EXCEPTION 'Explicit agreement and typed legal name required'; END IF;
  UPDATE public.sf_creator_contracts SET status='creator_signed',
   creator_signature=btrim(p_legal_name),creator_signed_at=now() WHERE id=item.id;
 ELSE
  UPDATE public.sf_creator_contracts SET status='declined' WHERE id=item.id;
 END IF;
 INSERT INTO public.sf_creator_contract_events(contract_id,actor_id,event_kind,agreement_hash,event_details)
 VALUES(item.id,actor,CASE WHEN p_action='sign' THEN 'creator_signed' ELSE 'declined' END,
 item.agreement_hash,jsonb_build_object('consent',p_action='sign','method','authenticated_click_with_typed_name'));
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'contracts.creator_'||p_action,actor,jsonb_build_object('contract_id',item.id,'hash',item.agreement_hash));
 INSERT INTO public.notifications(recipient_id,actor_id,kind,post_id,message)
 VALUES(item.invited_by,actor,'system_announcement',NULL,
  CASE WHEN p_action='sign' THEN '创作者已确认签署合作协议，请进入签约审核台进行平台复签。'
  ELSE '创作者已拒绝合作签约邀请，请进入签约审核台查看。' END);
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_contract_creator_decide(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_contract_creator_decide(uuid,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_contract_admin_decide(
 p_id uuid,p_action text,p_signer_name text DEFAULT NULL,p_confirm boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=(SELECT auth.uid()); item public.sf_creator_contracts%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.sf_staff_roles r
 WHERE r.user_id=actor AND r.enabled AND r.role IN('founder','super_admin')) THEN
  RAISE EXCEPTION 'Authorized platform signer only' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('sign','withdraw') THEN RAISE EXCEPTION 'Invalid contract action'; END IF;
 SELECT * INTO item FROM public.sf_creator_contracts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;
 IF item.creator_id=actor THEN RAISE EXCEPTION 'Signer conflict'; END IF;
 IF p_action='sign' THEN
  IF item.status<>'creator_signed' THEN RAISE EXCEPTION 'Creator must sign first'; END IF;
  IF p_confirm IS DISTINCT FROM true OR char_length(btrim(coalesce(p_signer_name,''))) NOT BETWEEN 2 AND 100 THEN
   RAISE EXCEPTION 'Platform signing confirmation and name required'; END IF;
  UPDATE public.sf_creator_contracts SET status='completed',
   platform_signer_id=actor,platform_signature=btrim(p_signer_name),
   platform_signed_at=now(),completed_at=now() WHERE id=item.id;
 ELSE
  IF item.status NOT IN ('invited','creator_signed') THEN RAISE EXCEPTION 'Cannot withdraw completed contract'; END IF;
  UPDATE public.sf_creator_contracts SET status='withdrawn' WHERE id=item.id;
 END IF;
 INSERT INTO public.sf_creator_contract_events(contract_id,actor_id,event_kind,agreement_hash,event_details)
 VALUES(item.id,actor,CASE WHEN p_action='sign' THEN 'platform_signed' ELSE 'withdrawn' END,item.agreement_hash,
 jsonb_build_object('confirmed',p_action='sign','method','authenticated_click_with_typed_name'));
 INSERT INTO public.sf_admin_activity(actor_id,action,target_user_id,details)
 VALUES(actor,'contracts.platform_'||p_action,item.creator_id,jsonb_build_object('contract_id',item.id,'hash',item.agreement_hash));
 INSERT INTO public.notifications(recipient_id,actor_id,kind,post_id,message)
 VALUES(item.creator_id,actor,'system_announcement',NULL,
 CASE WHEN p_action='sign' THEN '创作者合作协议已由平台复签完成，请在「我的签约」查看最终留存文本和双方签署时间。'
 ELSE '平台已撤回合作签约邀请，请进入「我的签约」查看状态。' END);
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_contract_admin_decide(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_contract_admin_decide(uuid,text,text,boolean) TO authenticated;
