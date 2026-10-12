import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const api=read('app/api/creative/route.ts');
const models=read('lib/creative-models.ts');
const ui=read('components/StarflowCreativeStudio.tsx');
const css=read('components/StarflowCreativeStudio.css');
const sql=read('supabase/migrations/20261012_ai_creative_studio.sql');
const nav=read('components/StarflowHomeMenu.tsx');
const page=read('app/ai-studio/page.tsx');

test('all five modes have real, whitelisted model adapters and a live UI',()=>{
 for(const mode of ['image','text_video','image_video','motion','edit_video']){
  assert.ok(models.includes(mode+':{'), 'adapter missing '+mode);
 }
 for(const model of ['fal-ai/flux-2','kling-video/v2.5-turbo/pro/text-to-video',
   'kling-video/v2.5-turbo/pro/image-to-video',
   'kling-video/v2.6/standard/motion-control','wan/v2.7/edit-video']){
  assert.ok(models.includes(model),model);
 }
 assert.match(models,/function creativeInput/);
 assert.match(models,/character_orientation:'video'/);
 assert.match(models,/reference_image_url:imageUrl/);
 assert.match(models,/extractCreativeOutput/);
 assert.match(page,/StarflowCreativeStudio/);
 assert.match(nav,/to:'\/ai-studio'/);
 assert.match(ui,/creativeModeKeys\.map/);
 assert.match(ui,/AI 生成/);
 assert.match(css,/@media\(max-width:600px\)/);
});

test('paid inference never uses a public model key, arbitrary URL or fake demo output',()=>{
 assert.match(api,/process\.env\.STARFLOW_CREATIVE_ENABLED!=='true'/);
 assert.match(api,/process\.env\.FAL_KEY/);
 assert.match(api,/Authorization:'Key '\+key/);
 assert.match(api,/Object\.values\(creativeModes\)\.some\(m=>m\.model===model\)/);
 assert.match(api,/await auth\.client\.rpc\('sf_creative_claim'/);
 assert.match(api,/await falFetch\(falUrl\(spec\.model\),'POST',input\)/);
 assert.match(api,/if\(!process\.env\.FAL_KEY\)/);
 assert.match(api,/params\.get\('capability'\)==='1'/);
 assert.match(ui,/engineReady===true/);
 assert.match(ui,/loadCapability\(\)/);
 assert.doesNotMatch(ui,/demo\.mp4|example\.com|Math\.random\(\).*video/);
 assert.doesNotMatch(api,/service_role|NEXT_PUBLIC_FAL_KEY/);
 assert.match(api,/Cache-Control':'private, no-store'/);
});

test('only authenticated owners can access jobs and private input references',()=>{
 assert.match(api,/client\.auth\.getUser\(token\)/);
 assert.match(api,/Authorization:'Bearer '\+token/);
 assert.match(api,/\.eq\('user_id',auth\.userId\)/);
 assert.match(api,/createSignedUrl\(path,60\*60\*6\)/);
 assert.match(api,/path\.startsWith\(session\.userId\+'\/'\+folder\+'\/'\)/);
 assert.match(api,/body\.rights!==true/);
 assert.match(sql,/ALTER TABLE public\.sf_creative_jobs ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT SELECT ON public\.sf_creative_jobs TO authenticated/);
 assert.match(sql,/CREATE POLICY sf_creative_owner_read/);
 assert.match(sql,/CREATE POLICY sf_creative_owner_status/);
 assert.match(sql,/storage\.buckets\(id,name,public,file_size_limit/);
 assert.match(sql,/sf-creative-inputs','sf-creative-inputs',false/);
 assert.match(sql,/sf_creative_upload_own/);
 assert.match(sql,/sf_creative_read_own/);
 assert.match(sql,/sf_creative_delete_own/);
 assert.doesNotMatch(sql,/GRANT\s+INSERT\s+ON public\.sf_creative_jobs/);
});

test('quota claims are atomic and expensive video requests have stricter limits',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/status IN \('preparing','queued','running'\)/);
 assert.match(sql,/CASE WHEN is_image THEN 8 ELSE 2 END/);
 assert.match(sql,/CASE WHEN is_image THEN 150 ELSE 25 END/);
 assert.match(sql,/pg_advisory_xact_lock\(0,8242026\)/);
 assert.match(sql,/created_at>now\(\)-interval '1 day'/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(api,/if\(state==='FAILED'\|\|state==='CANCELLED'\)/);
 assert.match(api,/Date\.now\(\)-new Date\(job\.created_at\)\.getTime\(\)>6\*60\*60\*1000/);
});

test('UX shows real asynchronous output with consent, drafts and a no-key warning',()=>{
 assert.match(ui,/input type="checkbox" checked=\{rights\}/);
 assert.match(ui,/setJobs\(previous=>/);
 assert.match(ui,/\/api\/creative\?id=/);
 assert.match(ui,/sf-creative-progress/);
 assert.match(ui,/job\.status==='completed'&&job\.result_url/);
 assert.match(ui,/重新生成|生成请求失败/);
 assert.match(ui,/结果文件链接可能有保留期限/);
 assert.match(ui,/createObjectURL/);
 assert.match(ui,/URL\.revokeObjectURL/);
 assert.match(models,/isAllowedFalResult/);
});
