import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const privacy=read('../supabase/migrations/20261012_private_follows_aggregate_counts.sql');
const views=read('../supabase/migrations/20261012_real_unique_post_views.sql');
const ui=read('../components/StarflowProfileEnhancements.tsx');
const app=read('../components/SocialApp.tsx');
const feed=read('../components/StarflowMasonryFeed.tsx');

test('Follower identities are private at the database policy layer',()=>{
 assert.match(privacy,/DROP POLICY IF EXISTS "read follows"/);
 assert.match(privacy,/CREATE POLICY "private follow relationships"/);
 assert.match(privacy,/FOR SELECT TO authenticated/);
 assert.match(privacy,/follower_id = \(SELECT auth\.uid\(\)\) OR following_id = \(SELECT auth\.uid\(\)\)/);
 assert.match(privacy,/SECURITY DEFINER/);
 assert.match(privacy,/REVOKE ALL ON FUNCTION public\.sf_profile_follow_counts\(uuid\) FROM PUBLIC, anon/);
 assert.match(ui,/viewerId !== profile\.id/);
 assert.match(ui,/ownProfile && connections/);
 assert.match(ui,/const ownProfile = viewerId === profile\.id/);
 assert.match(ui,/此账号的粉丝名单仅本人可见/);
 assert.match(ui,/此账号的关注名单仅本人可见/);
 assert.doesNotMatch(ui,/client\.from\('follows'\)\.select\('follower_id', \{ count: 'exact'/);
 assert.match(ui,/rpc\('sf_profile_follow_counts'/);
});

test('View figures represent real distinct authenticated post visitors, not preset values',()=>{
 assert.match(views,/PRIMARY KEY\(post_id,viewer_id\)/);
 assert.match(views,/ALTER TABLE public\.post_views ENABLE ROW LEVEL SECURITY/);
 assert.match(views,/REVOKE ALL ON public\.post_views FROM anon,authenticated/);
 assert.match(views,/IF auth\.uid\(\) IS NULL THEN RETURN false/);
 assert.match(views,/ON CONFLICT\(post_id,viewer_id\) DO NOTHING/);
 assert.match(views,/IF auth\.uid\(\) IS NULL OR p_post_ids IS NULL/);
 assert.match(views,/count\(v\.viewer_id\)::bigint/);
 assert.match(app,/view==='post' && target && result\.some\(p=>p\.id===target\)/);
 assert.match(app,/rpc\('sf_record_post_view'/);
 assert.match(app,/rpc\('sf_post_view_counts'/);
 assert.match(app,/浏览<\/span>/);
 assert.match(feed,/sf-masonry-view-count/);
});
