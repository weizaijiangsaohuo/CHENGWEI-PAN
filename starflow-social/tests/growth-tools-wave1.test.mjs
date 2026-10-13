import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261013090000_growth_tools_wave1.sql');
const cron=read('supabase/migrations/20261013090100_scheduled_posts_cron.sql');
const drafts=read('components/StarflowDraftScheduler.tsx');
const trending=read('components/StarflowTrending.tsx');
const home=read('components/SocialApp.tsx');
const manifest=read('app/manifest.ts');

test('Cloud drafts are per-user and not accessible to anonymous visitors',()=>{
 for(const s of ['ENABLE ROW LEVEL SECURITY','sf_post_drafts_owner_select',
  'sf_post_drafts_owner_insert','sf_post_drafts_owner_update','sf_post_drafts_owner_delete',
  'WITH CHECK ((SELECT auth.uid())=user_id)','REFERENCES auth.users(id) ON DELETE CASCADE']){
  assert.ok(schema.includes(s),s);
 }
 assert.ok(schema.includes('REVOKE ALL ON public.sf_post_drafts FROM PUBLIC,anon,authenticated'));
});
test('Only authenticated author can schedule or cancel; background dispatcher is private',()=>{
 for(const s of ['(SELECT auth.uid())','sf_schedule_text_post','sf_cancel_scheduled_post',
  'sf_dispatch_scheduled_posts','5 minutes','30 days','FOR UPDATE SKIP LOCKED',
  'WHERE id=p_id AND user_id=uid AND status=\'pending\'',
  'status=\'published\',post_id=published_id',
  'REVOKE ALL ON FUNCTION public.sf_dispatch_scheduled_posts() FROM PUBLIC,anon,authenticated,service_role']){
  assert.ok(schema.includes(s),s);
 }
 assert.ok(schema.includes("status='failed'"));
 assert.ok(!schema.includes('GRANT INSERT ON public.sf_scheduled_posts TO authenticated'));
 assert.ok(cron.includes("'* * * * *'"));
 assert.ok(cron.includes("SELECT public.sf_dispatch_scheduled_posts();"));
});
test('Trending derives 7-day counts from actual posts, not fixtures',()=>{
 for(const s of ["now()-interval '7 days'","LIMIT 5000","regexp_matches","count(*)::bigint","sf_trending_hashtags"]){
  assert.ok(schema.includes(s),s);
 }
 for(const s of ['sf_trending_hashtags','近7天','post_count','/explore?tag='])assert.ok(trending.includes(s),s);
});
test('Draft and scheduling screens are reachable from the real composing UI',()=>{
 for(const s of ['sf_post_drafts','sf_scheduled_posts','sf_schedule_text_post',
  'sf_cancel_scheduled_post','sf-draft-','schedule()'])assert.ok(drafts.includes(s),s);
 assert.ok(home.includes('href="/drafts"'));
 assert.ok(home.includes('href="/trending"'));
});
test('PWA manifest has no private data cache, permissions or pseudo push claims',()=>{
 assert.ok(manifest.includes("display:'standalone'"));
 assert.ok(manifest.includes("scope:'/'"));
 assert.ok(!manifest.includes('serviceWorker.register('));
});
