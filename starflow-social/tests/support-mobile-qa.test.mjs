import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/support/page.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../app/api/support/route.ts',import.meta.url),'utf8');
test('support readiness checks all needed Cloudflare bindings without secrets',()=>{
 assert.match(api,/export async function GET\(\)/);
 assert.match(api,/ready:Boolean\(bindings\.AI&&bindings\.SUPPORT_PER_IP&&bindings\.SUPPORT_GLOBAL\)/);
});
test('AI support is gated by the live readiness endpoint before chat submission',()=>{
 assert.match(page,/fetch\('\/api\/support'/);
 assert.match(page,/serviceStatus!=='ready'/);
 assert.match(page,/serviceStatus !== 'ready'/);
 assert.match(page,/copy\('connectError'\)/);
});
test('Safari support input uses 16px and actual official brand asset',()=>{
 assert.match(page,/iOS Safari does not auto-zoom/);
 assert.match(page,/font-size: 16px/);
 assert.match(page,/starflow-official-mark\.webp/);
 assert.match(page,/copy\('chatTitle'\)/);
});
test('assistant prompt does not falsely say private messages were cancelled',()=>{
 assert.doesNotMatch(api,/私信功能已取消/);
 assert.match(api,/站内私信/);
});
