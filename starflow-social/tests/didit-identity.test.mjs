import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {evaluateDiditDecision,verifyDiditEvent,readDiditDecision,createDiditSandboxReconciler} from '../lib/identity/didit-server.ts';

const sessionId='11111111-1111-4111-8111-111111111111';
const workflowId='22222222-2222-4222-8222-222222222222';
const reference='33333333-3333-4333-8333-333333333333';
const applicationId='44444444-4444-4444-8444-444444444444';
const eventId='55555555-5555-4555-8555-555555555555';
const binding={sessionId,workflowId,reference,nodes:{document:'doc',liveness:'live',face:'face',aml:'aml'}};
const feature=(node_id,extra={})=>({node_id,status:'Approved',warnings:[],...extra});
const decision=()=>({session_id:sessionId,workflow_id:workflowId,vendor_data:reference,session_kind:'user',environment:'sandbox',status:'Approved',
 id_verifications:[feature('doc')],liveness_checks:[feature('live',{method:'ACTIVE_3D'})],
 face_matches:[feature('face',{source_image_session_id:null})],aml_screenings:[feature('aml',{total_hits:0})]});

test('all required checks pass without granting a badge',()=>assert.equal(evaluateDiditDecision(decision(),binding),'checks_passed'));
test('passive liveness, missing liveness and missing method are rejected',()=>{
 for(const checks of [[],[feature('live',{method:'PASSIVE'})],[feature('live')],[feature('live',{method:'FLASHING'})]]){
  assert.equal(evaluateDiditDecision({...decision(),liveness_checks:checks},binding),'review');
 }
});
test('wrong session, reference, workflow, business or duplicate node cannot pass',()=>{
 for(const patch of [{session_id:workflowId},{vendor_data:sessionId},{workflow_id:reference},{session_kind:'business'},{id_verifications:[feature('doc'),feature('doc')]}]){
  assert.equal(evaluateDiditDecision({...decision(),...patch},binding),'review');
 }
});
test('face match must compare to document portrait; warning or AML hit requires review',()=>{
 for(const patch of [{face_matches:[feature('face',{source_image_session_id:sessionId})]},{face_matches:[feature('face',{warnings:[{risk:'HIGH'}],source_image_session_id:null})]},{aml_screenings:[]},{aml_screenings:[feature('aml',{total_hits:1})]},{id_verifications:[feature('doc',{status:'Declined'})]}]){
  assert.equal(evaluateDiditDecision({...decision(),...patch},binding),'review');
 }
});
test('status never substitutes for required evidence',()=>{
 assert.equal(evaluateDiditDecision({...decision(),status:'Declined'},binding),'declined');
 assert.equal(evaluateDiditDecision({...decision(),status:'In Progress'},binding),'pending');
 assert.equal(evaluateDiditDecision({...decision(),status:'In Review'},binding),'review');
 assert.equal(evaluateDiditDecision({...decision(),status:'Approved',face_matches:null},binding),'review');
});
const now=1795170000;
const cfg={secret:'synthetic-test-key-not-a-real-secret',applicationId,workflowId,workflowVersion:3,environment:'sandbox'};
const event={event_id:eventId,application_id:applicationId,workflow_id:workflowId,workflow_version:3,environment:'sandbox',session_id:sessionId,vendor_data:reference,timestamp:now,webhook_type:'status.updated',decision:{secret_biometric:'do-not-return'}};
const raw=(e=event)=>Buffer.from(JSON.stringify(e));
const signature=b=>createHmac('sha256',cfg.secret).update(b).digest('hex');
test('valid signed raw event is reduced to opaque routing fields',()=>{
 const b=raw();
 assert.deepEqual(verifyDiditEvent(b,signature(b),String(now),cfg,now),{eventId,sessionId,reference,workflowVersion:3});
});
test('tampering, stale timestamp, wrong app or environment are rejected',()=>{
 const b=raw();
 assert.equal(verifyDiditEvent(raw({...event,decision:{status:'Approved'}}),signature(b),String(now),cfg,now),null);
 assert.equal(verifyDiditEvent(b,signature(b),String(now),cfg,now+301),null);
 assert.equal(verifyDiditEvent(b,signature(b),String(now+1),cfg,now),null);
 for(const patch of [{application_id:reference},{environment:'live'},{workflow_version:4},{session_kind:'business'},{webhook_type:'transaction.created'}]){
  const t=raw({...event,...patch});
  assert.equal(verifyDiditEvent(t,signature(t),String(now),cfg,now),null);
 }
});
test('read-only adapter sends only GET to fixed provider, no redirect or raw report returned',async()=>{
 const mock=async(url,options)=>{
  assert.equal(url,'https://verification.didit.me/v3/session/'+sessionId+'/decision/');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers['x-api-key'],'fake-key');
  return Response.json({...decision(),full_name:'synthetic'});
 };
 assert.equal(await readDiditDecision('fake-key',binding,mock),'checks_passed');
 assert.equal(await readDiditDecision('',binding,()=>{throw new Error('not allowed')}),null);
 assert.equal(await readDiditDecision('fake-key',binding,async()=>new Response('',{status:500})),null);
});

test('sandbox coordinator refuses live, unbound and failed reads before database state mutation',async()=>{
 const b=raw(),sig=signature(b),calls=[];
 const options={enabled:true,config:cfg,apiKey:'synthetic',resolve:async()=>({binding,revision:2,workflowVersion:3,environment:'sandbox'}),apply:async input=>{calls.push(input);return 'applied'},transport:async()=>Response.json(decision())};
 const run=opts=>createDiditSandboxReconciler({...options,...opts})(b,sig,String(now),now);
 assert.equal(await run({enabled:false}),'disabled');
 assert.equal(await run({config:{...cfg,environment:'live'}}),'disabled');
 assert.equal(await run({resolve:async()=>({binding:{...binding,reference:sessionId},revision:2,workflowVersion:3,environment:'sandbox'})}),'rejected');
 assert.equal(await run({transport:async()=>Response.json({...decision(),environment:'live'})}),'retryable');
 assert.equal(await run({transport:async()=>Response.json({...decision(),session_id:workflowId})}),'retryable');
 assert.equal(await run({transport:async()=>new Response('',{status:503})}),'retryable');
 assert.equal(await run({transport:async()=>Response.json({...decision(),padding:'x'.repeat(2*1024*1024)})}),'retryable');
 assert.equal(calls.length,0);
 assert.equal(await run({}),'applied');
 assert.equal(calls.length,1);assert.equal(calls[0].attemptId,reference);assert.equal(calls[0].expectedRevision,2);assert.equal(calls[0].result,'checks_passed');
 assert.equal(await run({apply:async()=> 'duplicate'}),'duplicate');
});
