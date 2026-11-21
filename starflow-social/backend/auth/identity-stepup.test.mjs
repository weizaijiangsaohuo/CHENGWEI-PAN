import {test} from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {createIdentityStepupHandler} from './identity-stepup.mjs';
const origin='https://fixture.invalid',id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const session={user:{id:id(1),emailVerified:true,twoFactorEnabled:true},session:{id:id(2),userId:id(1),expiresAt:new Date(Date.now()+60000)}};
const request=(data={code:'123456',subject:null,before:null})=>new Request(origin+'/api/v2/admin/identity/stepup',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
test('fresh verifier success and unchanged session required before isolated issue',async()=>{
 const calls=[];const auth={api:{getSession:async()=>session},handler:async r=>{assert.equal(new URL(r.url).pathname,'/api/identity/auth/two-factor/verify-totp');assert.deepEqual(await r.json(),{code:'123456',trustDevice:false});return Response.json({user:{id:id(1)}});}};
 const pool={connect:async()=>({query:async(s,args)=>{calls.push([s,args]);if(s.startsWith('SELECT'))return {rows:[{proof:id(3)}]};},release(){}})};
 const handle=createIdentityStepupHandler({auth,pool,origin,replayKey:randomBytes(32)});
 assert.equal((await handle(request({code:'123456',subject:null,before:null,trustDevice:true}))).status,400);
 const r=await handle(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{proof:id(3)});
 assert.equal(calls[1][0],'SET LOCAL ROLE sf_identity_proof_issuer');assert.deepEqual(calls[2][1].slice(0,4),[id(1),id(2),null,null]);assert.equal(calls[2][1][4].length,32);
});
test('incorrect code, absent MFA and session rotation never issue a proof',async()=>{
 const pool={connect:async()=>{throw Error('unexpected database access')}};
 const cases=[{api:{getSession:async()=>session},handler:async()=>new Response('',{status:400})},{api:{getSession:async()=>({...session,user:{...session.user,twoFactorEnabled:false}})}},{api:{getSession:(()=>{let n=0;return async()=>++n===1?session:{...session,session:{...session.session,id:id(4)}};})()},handler:async()=>Response.json({user:{id:id(1)}})}];
 for(const auth of cases){const r=await createIdentityStepupHandler({auth,pool,origin,replayKey:randomBytes(32)})(request());assert.ok([401,403].includes(r.status));}
});
