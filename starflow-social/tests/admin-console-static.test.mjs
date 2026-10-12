import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261012001030_starflow_admin_role_foundation_20261012.sql');
const actions=read('supabase/migrations/20261012001139_starflow_admin_actions_20261012.sql');
const verification=read('supabase/migrations/20261012001200_starflow_admin_verification_roles.sql');
const consoleUI=read('components/StarflowSuperAdmin.tsx');
const route=read('app/admin/console/page.tsx');
const layout=read('app/layout.tsx');
test('all new administrator tables use RLS',()=>{
 for(const name of ['sf_staff_roles','sf_admin_activity','sf_account_restrictions','sf_platform_settings','sf_platform_announcements','sf_moderated_posts']){
  assert.match(schema,new RegExp('ALTER TABLE public\\.'+name+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(schema,/REVOKE ALL ON public\.sf_staff_roles/);
 assert.match(schema,/sf_admin_has_permission/);
});
test('all high-risk RPCs require server-side permissions and an audit trail',()=>{
 for(const fn of ['sf_admin_set_staff','sf_admin_restrict_user','sf_admin_moderate_post','sf_admin_review_report','sf_admin_save_announcement','sf_admin_update_setting','sf_admin_send_notice_v2']){
  const part=actions.split('CREATE OR REPLACE FUNCTION public.'+fn+'(')[1];
  assert.ok(part,fn+' is missing');
  assert.match(part.split('END $fn$;')[0],/sf_admin_has_permission/);
 }
 assert.match(actions,/CREATE TRIGGER sf_block_restricted_writes/);
 assert.match(actions,/DROP POLICY IF EXISTS "read posts"/);
 assert.match(verification,/sf_admin_has_permission\('verifications.manage'\)/);
});
test('no private message reading or privileged server credentials in client console',()=>{
 assert.match(route,/StarflowSuperAdmin/);
 assert.match(consoleUI,/sf_admin_restrict_user/);
 assert.match(consoleUI,/sf_admin_moderate_post/);
 assert.match(consoleUI,/sf_admin_save_announcement/);
 assert.doesNotMatch(consoleUI,/service_role|auth\.admin|dm_messages.*select/);
 assert.match(layout,/StarflowPublicAnnouncements/);
});
