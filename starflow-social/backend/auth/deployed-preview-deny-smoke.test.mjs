import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probePublicPreviewDeny} from './deployed-preview-deny-smoke.mjs';
const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
test('all three named preview read-only APIs deny anonymous requests without secrets',async()=>{
 let calls=0,cancels=0;
 const result=await probePublicPreviewDeny({fetchImpl:async(url,options)=>{
  const path=['/api/v2/provider-readiness','/api/v2/readiness','/api/v2/registration-readiness'][calls];
  assert.equal(url,origin+path);calls++;
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');assert.equal(options.headers.accept,'application/json');
  assert.equal(Object.hasOwn(options.headers,'x-starflow-preview-key'),false);
  assert.ok(options.signal);
  return {status:calls%2?403:404,redirected:false,body:{cancel:async()=>{cancels++;}}};
 }});
 assert.equal(result.state,'pass');assert.equal(calls,3);assert.equal(cancels,3);
 assert.deepEqual(result.probes.map(r=>r.state),['denied','denied','denied']);
 assert.ok(!JSON.stringify(result).includes(origin));
});
test('success, server errors, redirects, and unreachable preview never count as protected',async()=>{
 for(const fetchImpl of [async()=>new Response(null,{status:200}),
  async()=>new Response(null,{status:503}),
  async()=>({status:403,redirected:true}),
  async()=>{throw Error('sensitive details must not leak');}]){
  const result=await probePublicPreviewDeny({fetchImpl});
  assert.equal(result.state,'fail');
  assert.equal(JSON.stringify(result).includes('sensitive details'),false);
 }
});
