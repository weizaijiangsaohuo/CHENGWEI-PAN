import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPreview,origin} from './verify-preview.mjs';
const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const key='c'.repeat(64);
function fixture(requests){
 return async(url,options)=>{
  requests.push({url,options});
  assert.equal(new URL(url).origin,origin);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  if(url.endsWith('/readiness'))return options.headers['x-starflow-preview-key']===key?reply(200,{ready:true}):reply(403,{error:'not_permitted'});
  assert.equal(options.headers['x-starflow-preview-key'],undefined);
  return reply(404,{error:'not_permitted'});
 };
}
test('public denial and authenticated readiness are independent; key transmitted only to fixed readiness URL',async()=>{
 const requests=[];const fetcher=fixture(requests);
 assert.equal((await verifyPreview({fetcher})).code,'public_guards_verified_owner_readiness_required');
 assert.equal((await verifyPreview({fetcher,ownerKey:key})).accepted,true);
 assert.equal(requests.filter(r=>r.options.headers['x-starflow-preview-key']).length,1);
 assert.equal((await verifyPreview({fetcher,ownerKey:'bad'})).code,'invalid_owner_key');
});
test('fail closed on unexpected status, cache policy, transport error or missing authorization',async()=>{
 for(const response of [()=>reply(200,{}),()=>Response.json({error:'not_permitted'},{status:404}),()=>{throw Error('synthetic secret');}]){
  assert.equal((await verifyPreview({fetcher:async()=>response(),ownerKey:key})).accepted,false);
 }
 assert.equal((await verifyPreview({fetcher:fixture([]),ownerKey:'d'.repeat(64)})).accepted,false);
});
