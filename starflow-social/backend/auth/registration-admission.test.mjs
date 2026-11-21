import {test} from 'node:test';import assert from 'node:assert/strict';import {createRegistrationAdmission} from './registration-admission.mjs';
const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',emailVerified:false};
test('independent restricted transaction and exact subject; no reset or verified new signup',async()=>{
 const calls=[];const a=createRegistrationAdmission({connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{allowed:true}]};},release(){}})});
 assert.equal(await a.issueForNewSignup({...user,emailVerified:true}),false);
 assert.equal(await a.allowRecipient({...user,purpose:'reset'}),false);
 assert.equal(await a.issueForNewSignup(user),true);
 assert.equal(await a.allowRecipient({...user,purpose:'verify'}),true);
 assert.deepEqual(calls.map(x=>x[0]),['BEGIN','SET LOCAL ROLE sf_registration_issuer','SELECT sf_core.issue_registration_admission($1,$2) AS allowed','COMMIT','BEGIN READ ONLY','SET LOCAL ROLE sf_registration_issuer','SELECT sf_core.registration_mail_allowed($1,$2) AS allowed','COMMIT']);
 assert.deepEqual(calls[2][1],[user.id,user.email]);assert.deepEqual(calls[6][1],[user.id,user.email]);
});
test('database failure and malformed subject fail closed',async()=>{
 const a=createRegistrationAdmission({connect:async()=>{throw Error('private fixture');}});
 assert.equal(await a.issueForNewSignup(user),false);assert.equal(await a.allowRecipient({...user,purpose:'verify'}),false);assert.equal(await a.issueForNewSignup({}),false);
});
