-- Genuine post views: each authenticated user can contribute at most one
-- view per post. Do not manufacture users, views or artificial engagement.
BEGIN;
CREATE TABLE IF NOT EXISTS public.post_views (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_starflow_post_views_viewer ON public.post_views(viewer_id);
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_views FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.sf_record_post_view(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id=p_post_id) THEN RETURN false; END IF;
  INSERT INTO public.post_views(post_id,viewer_id)
    VALUES(p_post_id,auth.uid())
    ON CONFLICT(post_id,viewer_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sf_record_post_view(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_record_post_view(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sf_post_view_counts(p_post_ids uuid[])
RETURNS TABLE(post_id uuid,views bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_post_ids IS NULL OR coalesce(array_length(p_post_ids,1),0)>100
  THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, count(v.viewer_id)::bigint AS views
    FROM public.posts p
    LEFT JOIN public.post_views v ON v.post_id=p.id
    WHERE p.id=ANY(p_post_ids)
    GROUP BY p.id;
END;
$$;
REVOKE ALL ON FUNCTION public.sf_post_view_counts(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_post_view_counts(uuid[]) TO authenticated;
COMMIT;
