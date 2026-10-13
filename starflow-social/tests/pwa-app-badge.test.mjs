import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const badge=read('components/StarflowAppBadge.tsx');
const root=read('app/layout.tsx');
const manifest=read('app/manifest.ts');

test('PWA application badge displays only real unread counts of the authenticated account',()=>{
 for(const marker of [
  'client.auth.getUser()',
  "from('notifications').select('id',{head:true,count:'exact'})",
  ".eq('recipient_id',userId).is('read_at',null)",
  "filter:'recipient_id=eq.'+user.id",
  'Math.min(99,count||0)',
  'browser.setAppBadge?',
  'browser.clearAppBadge?',
  "event==='SIGNED_OUT'",
  "event==='TOKEN_REFRESHED'",
  "document.addEventListener('visibilitychange'",
  '90_000'
 ])assert.ok(badge.includes(marker),marker);
});
test('PWA badge never requests OS notification permission or persists private payloads',()=>{
 assert.ok(!badge.includes('Notification.requestPermission'));
 assert.ok(!badge.includes('localStorage'));
 assert.ok(!badge.includes('sessionStorage'));
 assert.ok(!badge.includes('payload.new.message'));
 assert.ok(root.includes('<StarflowAppBadge/>'));
 assert.ok(manifest.includes("url:'/notifications'"));
});
