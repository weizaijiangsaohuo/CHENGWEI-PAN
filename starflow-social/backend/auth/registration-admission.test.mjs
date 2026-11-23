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

import {createFreshSignupHandler} from './fresh-signup-handler.mjs';
test('registration preview rejects unsafe requests before account or mail work',async()=>{
 const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
 const signup='/api/identity/auth/sign-up/email';
 const verify='/api/identity/auth/verify-email';
 const valid={email:'fixture@example.invalid',name:'Fixture',username:'fixture_123',password:'synthetic-passphrase-only'};
 let admissions=0,mail=0,dbAccess=0;
 const options={enabled:true,origin,secret:'synthetic-only-auth-secret-not-a-real-key',database:new Proxy({}, {get(){dbAccess++;throw Error('unexpected database access');}}),
   admissions:{async issueForNewSignup(){admissions++;throw Error('unexpected admission');}},
   mail:{async sendVerificationEmail(){mail++;throw Error('unexpected email');}},
   authorizePreview:async()=>true};
 const req=(path,payload=valid,extra={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload),...extra});
 const handler=createFreshSignupHandler(options);
 const cases=[
  [createFreshSignupHandler({...options,enabled:false}),req(signup),404],
  [createFreshSignupHandler({...options,authorizePreview:async()=>false}),req(signup),403],
  [createFreshSignupHandler({...options,authorizePreview:async()=>{throw Error('private');}}),req(signup),403],
  [handler,new Request('https://weizai.weizai.workers.dev'+signup,{method:'POST'}),404],
  [handler,req(signup,valid,{headers:{origin:'https://example.invalid','content-type':'application/json'}}),403],
  [handler,req(signup,valid,{headers:{'content-type':'application/json'}}),403],
  [handler,req(signup+'?extra=1'),400],
  [handler,req(signup,{...valid,role:'admin'}),400],
  [handler,req(signup,{...valid,password:'short'}),400],
  [handler,req(signup,{...valid,username:'INVALID NAME'}),400],
  [handler,req(signup,{...valid,name:'x'.repeat(5000)}),400],
  [handler,req(signup,valid,{body:'{broken-json'}),400],
  [handler,req(signup,valid,{headers:{origin,'content-type':'text/plain'}}),400],
  [handler,new Request(origin+verify),400],
  [handler,new Request(origin+verify+'?token=a&token=b'),400],
  [handler,new Request(origin+verify+'?token=a&callbackURL=https://example.invalid'),400],
  [handler,new Request(origin+'/api/identity/auth/reset-password',{method:'POST'}),404]
 ];
 for(const [handle,request,status] of cases){
  const res=await handle(request);
  assert.equal(res.status,status,request.method+' '+new URL(request.url).pathname);
  assert.equal(res.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await res.json(),{error:'not_permitted'});
 }
 assert.equal(admissions,0);assert.equal(mail,0);assert.equal(dbAccess,0);
});
