import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261011_ai_history_and_quota.sql',import.meta.url),'utf8');
const widget=readFileSync(new URL('../components/StarflowAiWidget.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../app/api/ai/route.ts',import.meta.url),'utf8');
test('AI chat has the exact tables and quota RPC consumed by its endpoint',()=>{
 for(const item of ['ai_conversations','ai_messages','ai_request_limits','claim_ai_request'])
  assert.ok(sql.includes(item));
 assert.match(api,/\.rpc\('claim_ai_request'\)/);
 assert.match(api,/from\('ai_conversations'\)/);
 assert.match(api,/from\('ai_messages'\)/);
});
test('AI chat tables enforce user-owned row policies, never public conversation access',()=>{
 assert.match(sql,/ai_conversations ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/ai_messages ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/c\.user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.ai_messages TO authenticated/);
 assert.match(sql,/REFERENCES public\.ai_conversations\(id\) ON DELETE CASCADE/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_ai_request\(\) TO authenticated/);
});
test('chat supports deleting only user-owned conversations',()=>{
 assert.match(widget,/request\('DELETE'/);
 assert.match(api,/\.eq\('user_id', session\.userId\)/);
});
