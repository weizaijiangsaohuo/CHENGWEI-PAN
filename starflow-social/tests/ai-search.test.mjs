import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const repo=(x)=>fs.readFileSync(new URL('../'+x,import.meta.url),'utf8');
const logic=repo('lib/search-suggestions.ts');
const src=repo('components/StarflowAISearch.tsx');
const sql=repo('supabase/migrations/20261011_sf_ai_search_history.sql');
const compiled=ts.transpileModule(logic,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
vm.runInNewContext(compiled,{exports,Date,Map,Set}, {timeout:1000});
test('input one Chinese character 美 provides desired autocompletions',()=>{
 const list=exports.buildAISuggestions('美',exports.SEARCH_FALLBACK,[],[],8).map(x=>x.term);
 for(const value of ['美女','美少女','美人'])assert.ok(list.includes(value),value);
 assert.equal(new Set(list).size,list.length);
});
test('history is personalized and recent queries rank above generic word completions',()=>{
 const items=exports.buildAISuggestions('美',exports.SEARCH_FALLBACK,
  [{query:'美食做法',times_searched:3,last_searched_at:new Date().toISOString()}],[],8);
 assert.equal(items[0].term,'美食做法');
 assert.equal(items[0].source,'history');
});
test('recent topic suggestions reflect actual hashtag counts, with deduplication',()=>{
 const topics=exports.extractRecentHashtags(['#美食 #美食 今天分享','#美食 #美景','早安 #美景'],'美');
 const map=Object.fromEntries(topics.map(x=>[x.term,x.count]));
 assert.equal(map['美食'],2);
 assert.equal(map['美景'],2);
 const merged=exports.buildAISuggestions('美',[],[],[{term:'美景',count:8}],8);
 assert.equal(merged[0].term,'#美景');
 assert.equal(merged[0].source,'topic');
});
test('search suggestions never interpret special regex or wildcard characters',()=>{
 const rows=exports.buildAISuggestions('%',exports.SEARCH_FALLBACK,[],[]);
 assert.equal(rows.length,0);
});
test('privacy: only search owner can view, clear history; submitted searches use server-bound identity',()=>{
 assert.match(sql,/ALTER TABLE public\.sf_search_history ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/REVOKE ALL ON public\.sf_search_history FROM public,anon,authenticated/);
 assert.match(sql,/GRANT SELECT,DELETE ON public\.sf_search_history TO authenticated/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.sf_record_search/);
 assert.match(sql,/v_user uuid:=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/OFFSET 60/);
 assert.match(src,/\.rpc\('sf_record_search'/);
 assert.match(src,/sf_search_history/);
});
test('AI Search is correctly branded and honest about non-LLM fallback',()=>{
 assert.match(src,/starflow-official-mark\.webp/);
 assert.match(src,/STARFLOW/);
 assert.match(src,/AI 搜索/);
 assert.match(src,/猜你想搜/);
 assert.match(src,/暂未使用生成式大模型/);
 assert.match(src,/onKeyDown=\{onKey\}/);
});
