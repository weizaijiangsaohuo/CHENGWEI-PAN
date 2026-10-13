import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261013094000_community_and_lists_real_backend.sql');
const hub=read('components/StarflowHub.tsx');
test('Community, membership and join requests have enforced RLS and restricted mutations',()=>{
 for(const item of [
  'ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.communities,public.community_members,public.community_posts,public.community_join_requests FROM PUBLIC,anon,authenticated',
  'GRANT SELECT ON public.community_join_requests TO authenticated',
  'user_id=(SELECT auth.uid())',
  "r.role IN ('owner','moderator')"
 ])if(item.includes("r.role IN"))assert.ok(!sql.includes(item));else assert.ok(sql.includes(item),item);
 assert.ok(!sql.includes('GRANT INSERT ON public.community_members TO authenticated'));
});
test('No public execution of privilege escalation, owner decisions or post mapping',()=>{
 const names=[
  'create_community(text,text,text)',
  'sf_community_join(uuid)','sf_community_leave(uuid)',
  'sf_community_review_join(uuid,uuid,boolean)',
  'sf_community_set_moderator(uuid,uuid,boolean)',
  'sf_community_remove_member(uuid,uuid)',
  'publish_community_post(uuid,text)'
 ];
 for(const name of names){
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+' FROM PUBLIC,anon'),name);
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+name+' TO authenticated'),name);
 }
 assert.ok(sql.includes("AND c.owner_id=actor"),'server-side join approval owner checks');
 assert.ok(sql.includes("actor_role NOT IN('owner','moderator')"));
 assert.ok(sql.includes("target_role='owner'"));
 assert.ok(sql.includes("INSERT INTO public.community_posts"));
});
test('Hub performs join/approval/moderation using real security-checking RPCs',()=>{
 for(const name of ['sf_community_join','sf_community_leave','sf_community_review_join','sf_community_set_moderator','sf_community_remove_member','join_policy','pendingRequests','community_join_requests'])
  assert.ok(hub.includes(name),name);
 assert.ok(!hub.includes("from('community_members').insert("),'direct role insertion');
 assert.ok(!hub.includes("from('community_members').delete("),'direct role deletion');
});
test('Private list visibility is controlled by ownership and authenticated following',()=>{
 for(const key of [
  "visibility='public' OR owner_id=(SELECT auth.uid())",
  'social_list_members',
  'f.follower_id=(SELECT auth.uid())',
  'ALTER TABLE public.social_lists ENABLE ROW LEVEL SECURITY'
 ])assert.ok(sql.includes(key),key);
});
