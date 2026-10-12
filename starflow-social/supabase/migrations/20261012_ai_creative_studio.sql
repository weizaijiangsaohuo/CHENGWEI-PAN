-- Starflow AI 创作工作室 — private references and atomic per-user generation quotas.
-- Deploy to staging and verify cost controls before enabling a paid inference key in production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sf_creative_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK (mode IN ('image','text_video','image_video','motion','edit_video')),
 prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1800),
 image_path text, video_path text,
 aspect_ratio text NOT NULL DEFAULT '9:16' CHECK(aspect_ratio IN ('9:16','16:9','1:1')),
 duration smallint NOT NULL DEFAULT 5 CHECK(duration IN (5,10)),
 model_id text NOT NULL CHECK(length(model_id) BETWEEN 6 AND 160),
 status text NOT NULL DEFAULT 'preparing'
  CHECK(status IN ('preparing','queued','running','completed','failed')),
 provider_request_id text CHECK(provider_request_id IS NULL OR
  provider_request_id ~ '^[a-fA-F0-9-]{36}$'),
 result_url text CHECK(result_url IS NULL OR left(result_url,8)='https://'),
 error_message text CHECK(error_message IS NULL OR length(error_message)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS sf_creative_owner_created_idx
 ON public.sf_creative_jobs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sf_creative_owner_active_idx
 ON public.sf_creative_jobs(user_id,status,created_at DESC);
ALTER TABLE public.sf_creative_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_creative_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sf_creative_jobs TO authenticated;
-- Writes from server route are performed with the authenticated user's own JWT,
-- never service_role. A user cannot INSERT jobs directly to bypass limits.
GRANT UPDATE(status,provider_request_id,result_url,error_message,completed_at,updated_at)
 ON public.sf_creative_jobs TO authenticated;
DROP POLICY IF EXISTS sf_creative_owner_read ON public.sf_creative_jobs;
CREATE POLICY sf_creative_owner_read ON public.sf_creative_jobs FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_creative_owner_status ON public.sf_creative_jobs;
CREATE POLICY sf_creative_owner_status ON public.sf_creative_jobs FOR UPDATE TO authenticated
 USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));

-- Claim and quota counts are one transaction, protected by an advisory lock.
-- Expensive modes share the strict video quota; never grant public INSERT.
CREATE OR REPLACE FUNCTION public.sf_creative_claim(
 p_mode text,p_prompt text,p_image_path text,p_video_path text,
 p_aspect_ratio text,p_duration smallint,p_model_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 uid uuid := auth.uid();
 created uuid;
 is_image boolean := p_mode='image';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION '请先登录星流' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN ('image','text_video','image_video','motion','edit_video')
    OR p_prompt IS NULL OR char_length(btrim(p_prompt)) NOT BETWEEN 1 AND 1800
    OR p_aspect_ratio NOT IN ('9:16','16:9','1:1')
    OR p_duration NOT IN (5,10) OR p_model_id IS NULL
 THEN RAISE EXCEPTION '创作参数无效' USING ERRCODE='22023'; END IF;
 IF p_image_path IS NOT NULL AND (
    left(p_image_path,length(uid::text)+1)<>uid::text||'/' OR
    p_image_path !~ '^[0-9a-f-]+/images/[0-9a-f-]+\.(png|jpg|jpeg|webp)$')
 THEN RAISE EXCEPTION '图片只能来自本人上传的私有素材' USING ERRCODE='42501'; END IF;
 IF p_video_path IS NOT NULL AND (
    left(p_video_path,length(uid::text)+1)<>uid::text||'/' OR
    p_video_path !~ '^[0-9a-f-]+/videos/[0-9a-f-]+\.(mp4|mov|webm)$')
 THEN RAISE EXCEPTION '视频只能来自本人上传的私有素材' USING ERRCODE='42501'; END IF;
 IF (p_mode IN ('image_video','motion') AND p_image_path IS NULL)
    OR (p_mode IN ('motion','edit_video') AND p_video_path IS NULL)
    OR (p_mode='motion' AND (p_image_path IS NULL OR p_video_path IS NULL))
 THEN RAISE EXCEPTION '请先上传该模式需要的参考素材' USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtext(uid::text),8242026);
 IF (SELECT count(*) FROM public.sf_creative_jobs
     WHERE user_id=uid AND status IN ('preparing','queued','running')
       AND created_at>now()-interval '1 day')>=1
 THEN RAISE EXCEPTION '请等待上一项创作任务完成' USING ERRCODE='P0001'; END IF;
 IF (SELECT count(*) FROM public.sf_creative_jobs
     WHERE user_id=uid AND (mode='image')=is_image
       AND status<>'failed' AND created_at>now()-interval '1 day')
     >= CASE WHEN is_image THEN 8 ELSE 2 END
 THEN RAISE EXCEPTION '今日创作次数已达限额，请明天再试' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.sf_creative_jobs
  (user_id,mode,prompt,image_path,video_path,aspect_ratio,duration,model_id)
 VALUES(uid,p_mode,btrim(p_prompt),p_image_path,p_video_path,p_aspect_ratio,p_duration,p_model_id)
 RETURNING id INTO created;
 RETURN created;
END $fn$;
REVOKE ALL ON FUNCTION public.sf_creative_claim(text,text,text,text,text,smallint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_creative_claim(text,text,text,text,text,smallint,text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('sf-creative-inputs','sf-creative-inputs',false,52428800,
 ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=52428800,
 allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS sf_creative_upload_own ON storage.objects;
CREATE POLICY sf_creative_upload_own ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='sf-creative-inputs' AND
  (storage.foldername(name))[1]=(SELECT auth.uid())::text AND
  (storage.foldername(name))[2] IN ('images','videos') AND
  (storage.extension(name)) IN ('jpg','jpeg','png','webp','mp4','mov','webm'));
DROP POLICY IF EXISTS sf_creative_read_own ON storage.objects;
CREATE POLICY sf_creative_read_own ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='sf-creative-inputs' AND
  (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS sf_creative_delete_own ON storage.objects;
CREATE POLICY sf_creative_delete_own ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='sf-creative-inputs' AND
  (storage.foldername(name))[1]=(SELECT auth.uid())::text);
COMMIT;
