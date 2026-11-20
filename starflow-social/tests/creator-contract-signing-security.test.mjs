import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261013110000_creator_contract_workflow.sql');
const creator=read('components/StarflowCreatorContracts.tsx');
const admin=read('components/StarflowCreatorContractAdmin.tsx');
const nav=read('components/StarflowHomeMenu.tsx');
const terms=read('app/terms/page.tsx');

test('Issued contract records and signing events are private and immutable',()=>{
 for(const marker of [
  'ALTER TABLE public.sf_creator_contracts ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.sf_creator_contract_events ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.sf_creator_contracts,public.sf_creator_contract_events FROM PUBLIC,anon,authenticated',
  'GRANT SELECT ON public.sf_creator_contracts,public.sf_creator_contract_events TO authenticated',
  'creator_id=(SELECT auth.uid())',
  "sr.role IN ('founder','super_admin')",
  'sf_prevent_creator_contract_rewrite',
  'OLD.agreement_body IS DISTINCT FROM NEW.agreement_body',
  'OLD.agreement_hash IS DISTINCT FROM NEW.agreement_hash',
  "sha256",
  'sf_creator_contract_events'
 ])assert.ok(schema.includes(marker),marker);
 assert.ok(!schema.includes('GRANT UPDATE ON public.sf_creator_contracts TO authenticated'));
 assert.ok(!schema.includes('GRANT INSERT ON public.sf_creator_contract_events TO authenticated'));
});
test('Platform screening is real metrics with human decision not an automatic award',()=>{
 for(const key of ['sf_contract_candidates','interval \'90 days\'','public.posts','public.likes','public.follows','LIMIT 50','p_reason']){
  assert.ok(schema.includes(key),key);
 }
 for(const key of ['posts_90d','likes_90d','followers','筛选潜力创作者','人工筛选理由','查看作者主页'])assert.ok(admin.includes(key),key);
});
test('Only trusted staff invites and countersigns, creator explicitly consents to frozen copy',()=>{
 for(const key of [
  "r.role IN('founder','super_admin')",
  'IF p_creator IS NULL OR p_creator=actor',
  'p_source_post IS NOT NULL',
  "status IN('invited','creator_signed')",
  'p_agreed IS DISTINCT FROM true',
  'item.expires_at<=now()',
  "IF item.status<>'creator_signed'",
  'p_confirm IS DISTINCT FROM true',
  "status='completed'",
  "method','authenticated_click_with_typed_name",
  'sf_admin_activity',
  'public.notifications'
 ])assert.ok(schema.includes(key),key);
 assert.ok(creator.includes("sf_contract_creator_decide"));
 assert.ok(creator.includes('确认并签署此协议'));
 assert.ok(creator.includes('我已阅读并理解本次完整协议'));
 assert.ok(admin.includes('sf_contract_invite'));
 assert.ok(admin.includes('sf_contract_admin_decide'));
 assert.ok(admin.includes('平台确认复签，完成协议'));
});
test('Dedicated creator and admin pages expose archived hash and human-readable dates',()=>{
 assert.ok(creator.includes('agreement_hash'));
 assert.ok(creator.includes('event_kind'));
 assert.ok(creator.includes('window.print()'));
 assert.ok(nav.includes("to:'/contracts'"));
 assert.ok(nav.includes("to:'/admin/contracts'"));
 assert.ok(terms.includes('服务条款'));
});
