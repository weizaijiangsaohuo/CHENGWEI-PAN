import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=r('supabase/migrations/20261013104500_web_push_device_ownership.sql');
const ui=r('components/StarflowBackgroundPushSettings.tsx');
const guard=r('components/StarflowPushLogoutGuard.tsx');
const layout=r('app/layout.tsx');
test('Device status only returns ownership boolean, not another account endpoint',()=>{
 for(const marker of ['sf_web_push_device_registered','WHERE s.user_id=(SELECT auth.uid())','s.endpoint=p_endpoint',
  'REVOKE ALL ON FUNCTION public.sf_web_push_device_registered(text) FROM PUBLIC,anon',
  'GRANT EXECUTE ON FUNCTION public.sf_web_push_device_registered(text) TO authenticated']){
  assert.ok(sql.includes(marker),marker);
 }
 assert.ok(!sql.includes('RETURNS TABLE'));
});
test('A browser subscription is only valid for its currently authenticated account',()=>{
 assert.ok(ui.includes("sf_web_push_device_registered"));
 assert.ok(ui.includes('if(!ownerError&&owned!==true)'));
 assert.ok(ui.includes("await subscription.unsubscribe().catch(()=>{})"));
 assert.ok(ui.includes("next&&!configured"));
 assert.ok(ui.includes("取消本设备旧订阅"));
});
test('Signing out locally invalidates the push capability on this device',()=>{
 assert.ok(guard.includes("event!=='SIGNED_OUT'"));
 assert.ok(guard.includes('push.unsubscribe()'));
 assert.ok(guard.includes('navigator.serviceWorker.getRegistration()'));
 assert.ok(layout.includes('<StarflowPushLogoutGuard/>'));
});
