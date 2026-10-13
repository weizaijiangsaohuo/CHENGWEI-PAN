import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261013103000_web_push_transport.sql');
const ui=read('components/StarflowBackgroundPushSettings.tsx');
const settings=read('components/StarflowNotificationPreferences.tsx');
const sw=read('public/sw.js');
const sender=read('supabase/functions/sf-web-push-dispatch/index.ts');

test('Push subscriptions and deliveries are private, no browser reads of keys',()=>{
 for(const s of ['sf_web_push_subscriptions ENABLE ROW LEVEL SECURITY','sf_web_push_deliveries ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.sf_web_push_subscriptions FROM PUBLIC,anon,authenticated',
  'REVOKE ALL ON public.sf_web_push_deliveries FROM PUBLIC,anon,authenticated',
  'REFERENCES auth.users(id) ON DELETE CASCADE','UNIQUE(notification_id,subscription_id)']){
  assert.ok(migration.includes(s),s);
 }
 assert.ok(!migration.includes('GRANT SELECT ON public.sf_web_push_subscriptions TO authenticated'));
});
test('Subscriptions require signed-in user and restricted push provider host',()=>{
 for(const s of ['SELECT auth.uid()','Unsupported push gateway URL','p_endpoint !~','Maximum 6 devices',
  'sf_register_web_push','sf_unsubscribe_web_push','sf_web_push_subscription_count']){
  assert.ok(migration.includes(s),s);
 }
 assert.ok(migration.includes('WHERE public.sf_web_push_subscriptions.user_id=uid'));
 assert.ok(migration.includes('WHERE user_id=uid AND endpoint=p_endpoint'));
 assert.ok(!migration.includes('GRANT EXECUTE ON FUNCTION public.sf_register_web_push(text,text,text) TO anon'));
});
test('Queue is triggered by real inserted notifications and service_role alone can claim',()=>{
 for(const s of ['AFTER INSERT ON public.notifications',
  'NEW.id,s.id','WHERE s.user_id=NEW.recipient_id',
  'FOR UPDATE SKIP LOCKED','attempts=d.attempts+1','status=\'leased\'',
  'GRANT EXECUTE ON FUNCTION public.sf_claim_web_push_deliveries(integer) TO service_role',
  'GRANT EXECUTE ON FUNCTION public.sf_finish_web_push_delivery(uuid,integer) TO service_role',
  'p_status IN (404,410)','p_status BETWEEN 200 AND 299']){
  assert.ok(migration.includes(s),s);
 }
});
test('Browser requires user action, real VAPID key and public-only generic message',()=>{
 for(const s of ['Notification.requestPermission()','registration.pushManager.subscribe({',
  'sf_register_web_push','sf_unsubscribe_web_push','NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'json.keys?.p256dh','user?.id!==userId']){
  assert.ok(ui.includes(s),s);
 }
 assert.ok(settings.includes('<StarflowBackgroundPushSettings userId={userId}/>'));
 assert.ok(sw.includes("self.addEventListener('push'"));
 assert.ok(sw.includes("self.addEventListener('notificationclick'"));
 assert.ok(sw.includes("new URL('/notifications', self.location.origin)"));
 assert.ok(!sw.includes('event.data.json()'));
});
test('Edge dispatcher fails closed without token, encrypts pushes, never leaks private notification body',()=>{
 for(const s of ['SF_PUSH_DISPATCH_TOKEN','expected.length<32','sameSecret(actual,expected)',
  "req.method!=='POST'",'SF_WEB_PUSH_VAPID_PRIVATE_KEY','sf_claim_web_push_deliveries',
  'sf_finish_web_push_delivery','webpush.setVapidDetails','webpush.sendNotification',
  "JSON.stringify({type:'notification'})"]){
  assert.ok(sender.includes(s),s);
 }
 for(const unsafe of ['serviceRoleKey','payload.message','console.log(job)','Notification.body']){
  assert.ok(!sender.includes(unsafe),unsafe);
 }
});
