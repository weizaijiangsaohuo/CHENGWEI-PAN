-- Applied to starflow-staging via Supabase migration:
-- starflow_personalized_search_history_and_dictionary (2026-10-11).
-- Never apply to production without review.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sf_search_terms (
 term text PRIMARY KEY CHECK(char_length(term) BETWEEN 1 AND 48),
 category text NOT NULL DEFAULT 'related',
 relevance integer NOT NULL DEFAULT 10 CHECK(relevance BETWEEN 0 AND 1000)
);
CREATE INDEX IF NOT EXISTS sf_search_terms_prefix_idx ON public.sf_search_terms(term text_pattern_ops);
ALTER TABLE public.sf_search_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_search_terms FROM public,anon,authenticated;
GRANT SELECT ON public.sf_search_terms TO authenticated;
DROP POLICY IF EXISTS sf_search_terms_read ON public.sf_search_terms;
CREATE POLICY sf_search_terms_read ON public.sf_search_terms FOR SELECT TO authenticated USING(true);
INSERT INTO public.sf_search_terms(term,category,relevance) VALUES
 ('美女','related',150),('美少女','related',140),('美人','related',135),
 ('美食','related',131),('美妆','related',130),('美景','related',120),
 ('美术','related',110),('美甲','related',104),('美丽','related',101),
 ('美好','related',98),('美颜','related',95),('美剧','related',92),
 ('美图','related',90),('美文','related',88),('美发','related',84),
 ('少女','related',110),('少女穿搭','related',108),('少女心','related',103),
 ('动漫','related',115),('动漫头像','related',112),('动漫推荐','related',106),
 ('游戏','related',120),('游戏推荐','related',115),('游戏攻略','related',107),
 ('电影','related',110),('电影推荐','related',105),('电影解说','related',102),
 ('音乐','related',120),('音乐分享','related',108),('音乐推荐','related',105),
 ('旅行','related',116),('旅行攻略','related',111),('旅行日记','related',105),
 ('科技','related',115),('科技新闻','related',109),('科技数码','related',104),
 ('AI','related',123),('AI搜索','related',119),('AI绘画','related',115),
 ('人工智能','related',118),('人工智能应用','related',103),
 ('星流','brand',130),('星流官方','brand',128),('Starflow','brand',127),
 ('学习','related',112),('学习方法','related',108),('学习资料','related',104),
 ('穿搭','related',113),('穿搭分享','related',108),('穿搭灵感','related',104),
 ('情感','related',109),('情感故事','related',106),('情感交流','related',100),
 ('摄影','related',108),('摄影技巧','related',105),('摄影分享','related',99),
 ('宠物','related',114),('宠物日常','related',104),('宠物猫咪','related',102)
ON CONFLICT(term) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sf_search_history(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 query text NOT NULL CHECK(char_length(query) BETWEEN 1 AND 48),
 times_searched integer NOT NULL DEFAULT 1 CHECK(times_searched BETWEEN 1 AND 1000000),
 last_searched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,query)
);
CREATE INDEX IF NOT EXISTS sf_search_history_recent_idx ON public.sf_search_history(user_id,last_searched_at DESC);
ALTER TABLE public.sf_search_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sf_search_history FROM public,anon,authenticated;
GRANT SELECT,DELETE ON public.sf_search_history TO authenticated;
DROP POLICY IF EXISTS sf_search_history_read_own ON public.sf_search_history;
CREATE POLICY sf_search_history_read_own ON public.sf_search_history FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS sf_search_history_remove_own ON public.sf_search_history;
CREATE POLICY sf_search_history_remove_own ON public.sf_search_history FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.sf_record_search(p_query text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_query text:=btrim(COALESCE(p_query,''));
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF char_length(v_query)<1 OR char_length(v_query)>48 OR v_query ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'Search length must be 1 to 48 characters without control characters';
 END IF;
 INSERT INTO public.sf_search_history(user_id,query,times_searched,last_searched_at)
 VALUES (v_user,v_query,1,now()) ON CONFLICT(user_id,query) DO UPDATE SET
 times_searched=LEAST(public.sf_search_history.times_searched+1,1000000),
 last_searched_at=now();
 DELETE FROM public.sf_search_history WHERE user_id=v_user AND query IN(
  SELECT query FROM public.sf_search_history WHERE user_id=v_user
   ORDER BY last_searched_at DESC,query ASC OFFSET 60
 );
END $$;
REVOKE ALL ON FUNCTION public.sf_record_search(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_record_search(text) TO authenticated;
COMMIT;
