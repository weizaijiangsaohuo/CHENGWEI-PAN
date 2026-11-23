import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeWorker} from './deployed-preview-smoke.mjs';
const key='a'.repeat(64);
test('never contacts the network without a valid pre-existing authorization',async()=>{
 const fetchImpl=()=>{throw Error('unexpected call');};
 assert.equal((await probeWorker({fetchImpl})).state,'not_configured');
 assert.equal((await probeWorker({ownerKey:'wrong',fetchImpl})).state,'invalid_authorization');
});
test('uses only three fixed preview GET endpoints, no redirect, and verifies provider access without secrets',async()=>{
 let n=0;const result=await probeWorker({ownerKey:key,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev/api/v2/'+['readiness','registration-readiness','provider-readiness'][n]);
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers['x-starflow-preview-key'],key);
  const body=n===0?{ready:true}:n===1?{databaseReady:true,mailAdapterConfigured:false,liveMailVerified:false,registrationEnabled:false,safetyFlagsOff:true}:{brevo:'free_account_authorized',cloudinary:'usage_access_authorized'};
  n++;return Response.json(body);
 }});
 assert.equal(n,3);assert.equal(result.state,'database_ready');assert.equal(result.probes[1].liveMailVerified,false);
 assert.deepEqual(result.probes[2],{name:'providers',state:'authorized',brevoAuthorized:true,cloudinaryAuthorized:true});
 assert.ok(!JSON.stringify(result).includes(key));
});
test('does not mistake 403, 503, redirects, malformed bodies or oversized responses for success',async()=>{
 for(const factory of [()=>new Response(key,{status:403}),()=>new Response(key,{status:503}),()=>new Response(key),()=>Response.json({ready:false}),()=>new Response('{"ready":true,"x":"'+key.repeat(100)+'"}',{headers:{'content-type':'application/json'}}),()=>{throw Error(key);}]){
  const result=await probeWorker({ownerKey:key,fetchImpl:factory});
  assert.equal(result.state,'not_ready');assert.ok(!JSON.stringify(result).includes(key));
 }
});

test('provider authorization failures never produce a successful readiness state or leak response fields',async()=>{
 let n=0;
 const result=await probeWorker({ownerKey:key,fetchImpl:async()=>{
  const body=n++===0?{ready:true}:n===2?{databaseReady:true,mailAdapterConfigured:false,liveMailVerified:false,registrationEnabled:false,safetyFlagsOff:true}:{brevo:'unconfirmed',cloudinary:'usage_access_authorized',secret:key};
  return Response.json(body);
 }});
 assert.equal(n,3);
 assert.equal(result.state,'not_ready');
 assert.deepEqual(result.probes[2],{name:'providers',state:'unconfirmed',brevoAuthorized:false,cloudinaryAuthorized:true});
 assert.ok(!JSON.stringify(result).includes(key));
});

test('fails the live preview gate if signup unexpectedly becomes enabled',async()=>{
 let n=0;
 const result=await probeWorker({ownerKey:key,fetchImpl:async()=>{
  const body=n===0?{ready:true}:n===1?{databaseReady:true,mailAdapterConfigured:true,liveMailVerified:false,registrationEnabled:true,safetyFlagsOff:true}:{brevo:'free_account_authorized',cloudinary:'usage_access_authorized'};
  n++;return Response.json(body);
 }});
 assert.equal(n,3);
 assert.equal(result.state,'not_ready');
 assert.equal(result.probes[1].state,'unsafe_signup_enabled');
 assert.equal(result.probes[1].registrationEnabled,true);
 assert.ok(!JSON.stringify(result).includes(key));
});

test('rejects provider-ready staging when any release safety flag is on or missing',async()=>{
 for(const safetyFlagsOff of [false,undefined]){
  let n=0;
  const result=await probeWorker({ownerKey:key,fetchImpl:async()=>{
   const body=n===0?{ready:true}:n===1?{databaseReady:true,mailAdapterConfigured:false,liveMailVerified:false,
    registrationEnabled:false,...(safetyFlagsOff===undefined?{}:{safetyFlagsOff})}:{brevo:'free_account_authorized',cloudinary:'usage_access_authorized'};
   n++;return Response.json(body);
  }});
  assert.equal(n,3);
  assert.equal(result.state,'not_ready');
  assert.equal(result.probes[1].state,'unsafe_feature_flags');
  assert.equal(result.probes[1].safetyFlagsOff,false);
  assert.ok(!JSON.stringify(result).includes(key));
 }
});
