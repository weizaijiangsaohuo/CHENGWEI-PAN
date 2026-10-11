import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const notifications=read('../components/StarflowNotificationCenter.tsx');
const migration=read('../supabase/migrations/20261012_direct_message_notifications.sql');
const security=read('../components/StarflowSecurityCenter.tsx');
const drawer=read('../components/StarflowHomeMenu.tsx');
const styles=read('../app/starflow-official-notifications.css');

test('New DMs create private notices without exposing message text',()=>{
 assert.match(migration,/ADD CONSTRAINT notifications_kind_check/);
 assert.match(migration,/'direct_message'/);
 assert.match(migration,/CREATE TRIGGER sf_notify_new_direct_message/);
 assert.match(migration,/NEW\.sender_id = dc\.user_low/);
 assert.match(migration,/NEW\.sender_id = dc\.user_high/);
 assert.match(migration,/VALUES \(recipient, NEW\.sender_id, NULL, 'direct_message', NULL\)/);
 assert.doesNotMatch(migration,/NEW\.body/);
});

test('Notification center exposes private messages and links directly to chats',()=>{
 assert.match(notifications,/tab:'messages'/);
 assert.match(notifications,/name:'私信消息'/);
 assert.match(notifications,/href="\/messages"/);
 assert.match(notifications,/n\.kind === 'direct_message' && actor \? '\/messages\?to='/);
 assert.match(notifications,/encodeURIComponent\(actor\.handle\)/);
 assert.match(styles,/sf3-messages-link/);
});

test('Account safety hides unused third-party integrations and keeps secure mailbox recovery',()=>{
 assert.match(security,/availableProviders\.length>0/);
 assert.match(security,/availableProviders\.map\(/);
 assert.doesNotMatch(security,/暂无已启用的关联身份/);
 assert.match(security,/captchaToken:recoveryCaptcha\|\|undefined/);
 assert.match(security,/resetPasswordForEmail\(user\.email/);
 assert.match(security,/showRecovery&&/);
});

test('Mobile drawer focuses container instead of repeatedly highlighting brand logo',()=>{
 assert.match(drawer,/showModal\(\);dialog\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(drawer,/tabIndex=\{-1\}/);
});
