import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const api=read('app/api/creative/route.ts');
const sql=read('supabase/migrations/20261012_ai_creative_studio.sql');
const nav=read('components/StarflowHomeMenu.tsx');
const pageExists=existsSync(new URL('../app/ai-studio/page.tsx',import.meta.url));
test('retired paid studio has no entry point or provider transport',()=>{
 assert.equal(pageExists,false);
 assert.doesNotMatch(nav,/to:'\/ai-studio'/);
 assert.doesNotMatch(api,/FAL_KEY|queue\.fal\.run|falFetch|fetch\(|STARFLOW_CREATIVE_ENABLED|creativeInput|sf_creative_claim|\.rpc\(|\.insert\(|\.update\(|createSignedUrl/);
 assert.match(api,/export async function POST\(\)/);
 assert.match(api,/\/api\/creative\/zero。'},410/);
 assert.match(api,/enabled:false/);
});
test('historical records remain authenticated, owner-scoped and read only',()=>{
 assert.match(api,/client\.auth\.getUser\(token\)/);
 assert.match(api,/\.eq\('user_id',auth\.userId\)/);
 assert.match(api,/Cache-Control':'private, no-store'/);
 assert.match(api,/data\.status==='completed'\?data\.result_url:null/);
 assert.match(api,/UUID\.test\(id\)/);
 assert.match(sql,/ALTER TABLE public\.sf_creative_jobs ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY sf_creative_owner_read/);
 assert.match(sql,/sf-creative-inputs','sf-creative-inputs',false/);
});
