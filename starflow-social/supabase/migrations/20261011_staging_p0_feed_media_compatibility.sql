-- Applied to starflow-staging via Supabase migration API on 2026-10-11.
-- Migration name: starflow_staging_p0_feed_media_compatibility.
-- Additive, no users or posts deleted. Do not blindly execute in production.
BEGIN;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_poll boolean NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_gallery boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_nonempty;
ALTER TABLE public.posts ADD CONSTRAINT posts_nonempty CHECK
  (char_length(btrim(content)) > 0 OR image_url IS NOT NULL OR video_url IS NOT NULL);
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_video_url_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_video_url_check CHECK
  (video_url IS NULL OR (char_length(video_url) <= 2048 AND video_url ~ '^https://'));
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_message_length_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_message_length_check CHECK
  (message IS NULL OR char_length(message) <= 1000);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('post-videos','post-videos',true,52428800,ARRAY['video/mp4','video/webm','video/quicktime'])
ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS "starflow public post videos" ON storage.objects;
CREATE POLICY "starflow public post videos"
  ON storage.objects FOR SELECT TO public USING (bucket_id='post-videos');
DROP POLICY IF EXISTS "starflow upload own post videos" ON storage.objects;
CREATE POLICY "starflow upload own post videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='post-videos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS "starflow remove own post videos" ON storage.objects;
CREATE POLICY "starflow remove own post videos"
  ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id='post-videos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
COMMIT;
