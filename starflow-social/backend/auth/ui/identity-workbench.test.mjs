import {test} from 'node:test';import assert from 'node:assert/strict';import {createCasePageLoader,validateIdentityPage} from './identity-workbench.mjs';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const row={attemptId:id(1),principalId:id(2),state:'pending',submittedAt:'2026-10-10T00:00:00Z',evidenceKinds:['face_photo'],retainedUntil:'2099-01-01T00:00:00Z'};
test('allowlisted data only; reject wrong account, malformed state and cursor; expired evidence hidden',()=>{
 const v=validateIdentityPage({cases:[{...row,ciphertext:'secret'}],next:null},id(2));
 assert.equal(v.cases[0].ciphertext,undefined);assert.deepEqual(v.cases[0].evidenceKinds,['face_photo']);
 for(const patch of [{principalId:id(3)},{state:'<script>'},{evidenceKinds:['unexpected']},{retainedUntil:null}])assert.throws(()=>validateIdentityPage({cases:[{...row,...patch}],next:null},id(2)));
 assert.throws(()=>validateIdentityPage({cases:[row],next:row.attemptId},id(2)));
 assert.deepEqual(validateIdentityPage({cases:[{...row,retainedUntil:'2020-01-01T00:00:00Z'}],next:null},id(2)).cases[0].evidenceKinds,[]);
});
test('no proof issuer is disabled, and queries acquire fresh scope-bound proof',async()=>{
 let calls=0;const changes=[];const next=state=>changes.push(state);
 await createCasePageLoader({onChange:next,request:async()=>{calls++;}}).load();assert.equal(calls,0);assert.equal(changes.at(-1).status,'unavailable');
 const loader=createCasePageLoader({onChange:next,requestProof:async scope=>{assert.equal(scope.subject,id(2));assert.equal(scope.before,null);return id(9)},request:async(path,options)=>{
 calls++;assert.equal(path,'/api/v2/admin/identity/cases');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{proof:id(9),subject:id(2),before:null});return Response.json({cases:[row],next:null});}});
 await loader.load(id(2));assert.equal(calls,1);assert.equal(changes.at(-1).status,'ready');
 loader.clear();assert.deepEqual(changes.at(-1).cases,[]);
});
test('in-flight results cannot reappear after clear or next filter',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r});const changes=[];
 const loader=createCasePageLoader({onChange:v=>changes.push(v),requestProof:async()=>id(9),request:async()=>pending});
 const load=loader.load(id(2));await Promise.resolve();loader.clear();
 resolve(Response.json({cases:[row],next:null}));await load;
 assert.equal(changes.at(-1).status,'idle');assert.deepEqual(changes.at(-1).cases,[]);
});
