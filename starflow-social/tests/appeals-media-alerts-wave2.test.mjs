import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261013091000_user_appeals_workflow.sql');
const user=read('components/StarflowAppealCenter.tsx');
const admin=read('components/StarflowAppealModeration.tsx');
const alerts=read('components/StarflowLiveAlertBootstrap.tsx');
const preferences=read('components/StarflowNotificationPreferences.tsx');
const upload=read('lib/optimize-upload-image.ts');
const social=read('components/SocialApp.tsx');
const layout=read('app/layout.tsx');
test('appeal data is account-private and changes only via verified RPC',()=>{
 for(const s of ['ENABLE ROW LEVEL SECURITY','REVOKE ALL ON public.sf_user_appeals FROM PUBLIC,anon,authenticated',
  'FOR SELECT TO authenticated','user_id=(SELECT auth.uid())',
  'sf_submit_appeal','sf_admin_review_appeal','(SELECT auth.uid())',
  "actor_role NOT IN('founder','super_admin')","sf_admin_activity","'appeal.review'",
  "'appeal_result'","ON DELETE CASCADE"]){
  assert.ok(sql.includes(s),'missing '+s);
 }
 assert.ok(!sql.includes('GRANT UPDATE ON public.sf_user_appeals TO authenticated'));
 assert.ok(user.includes("sf_submit_appeal"));
 assert.ok(admin.includes("sf_admin_review_appeal"));
 assert.ok(admin.includes("window.confirm"));
});
test('foreground alerts never expose DM body or claim background push',()=>{
 assert.ok(alerts.includes("table:'notifications'"));
 assert.ok(alerts.includes("filter:'recipient_id=eq.'+user.id"));
 assert.ok(alerts.includes("Notification.permission==='granted'"));
 assert.ok(alerts.includes('你收到了新的互动或站内通知'));
 assert.ok(!alerts.includes('payload.new.message'));
 assert.ok(preferences.includes('Notification.requestPermission()'));
 assert.ok(preferences.includes("sf-live-alerts-enabled:"));
 assert.ok(layout.includes('<StarflowLiveAlertBootstrap/>'));
});
test('optimized image upload has safe fallback, skips GIF and keeps real upload status',()=>{
 for(const s of ['image/jpeg','image/png','image/webp','toBlob','URL.revokeObjectURL(url)','blob.size>=file.size','catch{return file;}']){
  assert.ok(upload.includes(s),s);
 }
 assert.ok(social.includes('optimizeImageForPost(file)'));
 assert.ok(social.includes('uploadFile,{contentType:uploadFile.type'));
 assert.ok(social.includes('正在上传图片'));
 assert.ok(social.includes('正在上传视频'));
});
