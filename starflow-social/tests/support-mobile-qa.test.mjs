import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/support/page.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../app/api/support/route.ts',import.meta.url),'utf8');
test('support readiness checks all needed Cloudflare bindings without secrets',()=>{
 assert.match(api,/export async function GET\(\)/);
 assert.match(api,/ready:Boolean\(bindings\.AI&&bindings\.SUPPORT_PER_IP&&bindings\.SUPPORT_GLOBAL\)/);
});
test('AI support unavailable status is shown before a chat can be sent',()=>{
 assert.match(page,/serviceStatus!=='ready' \|\| loading/);
 assert.match(page,/测试站的 AI 服务尚未就绪/);
});
test('Safari uses >=16px support input and Starflow official mark',()=>{
 assert.match(page,/Safari autozooms/);
 assert.match(page,/font-size: 16px/);
 assert.match(page,/starflow-official-mark\.webp/);
});
test('assistant prompt does not falsely say private messages were cancelled',()=>{
 assert.doesNotMatch(api,/私信功能已取消/);
 assert.match(api,/站内私信/);
});
