import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeWorker} from './deployed-preview-smoke.mjs';
const key='a'.repeat(64);
test('never contacts the network without a valid pre-existing authorization',async()=>{
 const fetchImpl=()=>{throw Error('unexpected call');};
 assert.equal((await probeWorker({fetchImpl})).state,'not_configured');
 assert.equal((await probeWorker({ownerKey:'wrong',fetchImpl})).state,'invalid_authorization');
});
test('uses only two fixed preview GET endpoints, no redirect, and reports email readiness accurately',async()=>{
 let n=0;const result=await probeWorker({ownerKey:key,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev/api/v2/'+(n===0?'readiness':'registration-readiness'));
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers['x-starflow-preview-key'],key);
  return Response.json(n++===0?{ready:true}:{databaseReady:true,mailAdapterConfigured:false,liveMailVerified:false,registrationEnabled:false});
 }});
 assert.equal(n,2);assert.equal(result.state,'database_ready');assert.equal(result.probes[1].liveMailVerified,false);
 assert.ok(!JSON.stringify(result).includes(key));
});
test('does not mistake 403, 503, redirects, malformed bodies or oversized responses for success',async()=>{
 for(const factory of [()=>new Response(key,{status:403}),()=>new Response(key,{status:503}),()=>new Response(key),()=>Response.json({ready:false}),()=>new Response('{"ready":true,"x":"'+key.repeat(100)+'"}',{headers:{'content-type':'application/json'}}),()=>{throw Error(key);}]){
  const result=await probeWorker({ownerKey:key,fetchImpl:factory});
  assert.equal(result.state,'not_ready');assert.ok(!JSON.stringify(result).includes(key));
 }
});
