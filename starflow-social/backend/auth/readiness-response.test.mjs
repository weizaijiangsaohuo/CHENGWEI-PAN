import {test} from 'node:test';import assert from 'node:assert/strict';import {readinessResponse} from './readiness-response.mjs';
const url='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev/api/v2/readiness';
test('only existing HTTP status is shown on the exact staging GET; no private fields or success changes',async()=>{
 for(const status of [400,403,404,503]){
  const source=Response.json({error:'private fixture',secret:'never-return'},{status});
  const r=readinessResponse(new Request(url),source);
  assert.equal(r.status,status);assert.deepEqual(await r.json(),{status,error:status===503?'unavailable':'not_permitted'});assert.equal(r.headers.get('cache-control'),'private, no-store');
 }
 for(const [u,method,status] of [[url,'GET',200],[url,'POST',403],[url+'?x=1','GET',403],[url.replace('feature-neon-backend-foundation-20261120-weizai','weizai'),'GET',404],[url.replace('/readiness','/me'),'GET',403]]){
  const r=Response.json({fixture:true},{status});assert.equal(readinessResponse(new Request(u,{method}),r),r);
 }
});
