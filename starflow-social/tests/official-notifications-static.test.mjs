import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261011_official_notifications_admin_audit.sql', import.meta.url), 'utf8');
const center = readFileSync(new URL('../components/StarflowNotificationCenter.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../components/StarflowNoticeDetail.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../components/AdminStudio.tsx', import.meta.url), 'utf8');

test('only admin may create audited official notices; existing user notifications remain locked', ()=>{
 assert.match(sql,/ALTER TABLE public\.notifications ALTER COLUMN actor_id DROP NOT NULL/);
 assert.match(sql,/system_announcement/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.official_notification_audit/);
 assert.match(sql,/ALTER TABLE public\.official_notification_audit ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY official_notification_audit_admin_read/);
 assert.match(sql,/public\.is_platform_admin\(\)/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.sf_admin_send_notice/);
 assert.match(sql,/REVOKE INSERT,DELETE ON public\.notifications FROM anon,authenticated/);
 assert.match(sql,/GRANT UPDATE\(read_at\) ON public\.notifications TO authenticated/);
 assert.match(sql,/p_kind NOT IN \('system_announcement','account_warning','account_security'\)/);
 assert.match(sql,/INSERT INTO public\.official_notification_audit/);
});
test('official notifications open an RLS-protected detail page, with no fake system sender', ()=>{
 assert.match(center,/system_announcement/);
 assert.match(center,/\/notifications\/\x27 \+ encodeURIComponent\(n\.id\)/);
 assert.match(detail,/\.eq\('recipient_id',auth\.data\.user\.id\)/);
 assert.match(detail,/\.update\(\{read_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(detail,/white-space:pre-wrap|item\.message\?\.trim\(\)/);
});
test('admin UI looks up recipient and uses dedicated secured RPC', ()=>{
 assert.match(admin,/authorized!==true\|\|noticeSending/);
 assert.match(admin,/\.eq\('handle',normalized\)\.maybeSingle\(\)/);
 assert.match(admin,/\.rpc\('sf_admin_send_notice'/);
 assert.match(admin,/official_notification_audit/);
});
