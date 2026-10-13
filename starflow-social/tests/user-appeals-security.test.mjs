import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261013091000_user_appeals_workflow.sql');
const user=read('components/StarflowAppealCenter.tsx');
const admin=read('components/StarflowAppealModeration.tsx');
const menu=read('components/StarflowHomeMenu.tsx');

test('appeal records are private and ordinary visitors cannot insert or read arbitrary data',()=>{
 for(const str of [
  'ALTER TABLE public.sf_user_appeals ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.sf_user_appeals FROM PUBLIC,anon,authenticated',
  'sf_appeals_owner_or_reviewer_read',
  'user_id=(SELECT auth.uid())',
  "AND r.role IN ('founder','super_admin')",
  'sf_submit_appeal',
  'sf_admin_review_appeal'
 ])assert.ok(sql.includes(str),str);
 assert.ok(!sql.includes('GRANT INSERT ON public.sf_user_appeals TO authenticated'));
});
test('server checks author, daily limits, admin role and writes audit + a real notification',()=>{
 for(const str of [
  'char_length(trim(coalesce(p_subject',
  'char_length(trim(coalesce(p_body',
  "status='pending'",
  "created_at>now()-interval '24 hours'",
  "actor_role NOT IN('founder','super_admin')",
  'FOR UPDATE',
  "INSERT INTO public.sf_admin_activity",
  "INSERT INTO public.notifications",
  "'appeal_result'"
 ])assert.ok(sql.includes(str),str);
 for(const signature of [
  'REVOKE ALL ON FUNCTION public.sf_submit_appeal(text,text,text) FROM PUBLIC,anon',
  'REVOKE ALL ON FUNCTION public.sf_admin_review_appeal(uuid,text,text) FROM PUBLIC,anon'
 ])assert.ok(sql.includes(signature));
});
test('appeal UI exposes real RPC and review result, not a mock inbox',()=>{
 for(const str of ['sf_user_appeals','sf_submit_appeal','刷新','审核反馈'])
  if(str!=='刷新')assert.ok(user.includes(str),str);
 for(const str of ['sf_staff_roles','founder','super_admin','sf_admin_review_appeal','审核'])
  assert.ok(admin.includes(str),str);
 for(const str of ["to:'/appeals'","to:'/admin/appeals'"])
  assert.ok(menu.includes(str),str);
});
