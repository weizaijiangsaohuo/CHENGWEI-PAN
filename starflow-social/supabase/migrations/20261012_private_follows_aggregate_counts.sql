-- Private follow/follower lists for every account, enforced in the database.
-- The signed-in person may inspect their own followers and their own follows.
-- Everyone else may see only verified aggregate counts via the bounded RPC.
BEGIN;
DROP POLICY IF EXISTS "read follows" ON public.follows;
DROP POLICY IF EXISTS "private follow relationships" ON public.follows;
CREATE POLICY "private follow relationships" ON public.follows
 FOR SELECT TO authenticated
 USING (follower_id = (SELECT auth.uid()) OR following_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.sf_profile_follow_counts(p_profile_id uuid)
RETURNS TABLE(followers bigint, following bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT
   (SELECT count(*) FROM public.follows WHERE following_id = p_profile_id),
   (SELECT count(*) FROM public.follows WHERE follower_id = p_profile_id)
 WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id);
$$;
REVOKE ALL ON FUNCTION public.sf_profile_follow_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sf_profile_follow_counts(uuid) TO authenticated;
COMMIT;
