import {test} from 'node:test';import assert from 'node:assert/strict';import {createIdentityQueueHandler} from './identity-queue.mjs';
const origin='https://fixture.invalid',id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const request=(body,from=origin)=>new Request(origin+'/api/v2/admin/identity/cases',{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(body)});
const valid={proof:id(3),subject:null,before:null};
test('list uses verified subject and session, does not return unexpected sensitive fields',async()=>{
 let calls=[];
 const auth={api:{getSession:async()=>({user:{id:id(1),emailVerified:true},session:{id:id(2),userId:id(1),expiresAt:new Date(Date.now()+60000)}})}};
 const pool={connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);if(sql.startsWith('SELECT'))return {rows:Array.from({length:51},(_,i)=>({attempt_id:id(100+i),principal_id:id(4),state:'pending',submitted_at:'fixture',evidence_kinds:[],retained_until:null,ciphertext:'do-not-return'}))};},release(){}})};
 const handle=createIdentityQueueHandler({auth,pool,origin});
 assert.equal((await handle(request({...valid,actor:id(9)}))).status,400);
 assert.equal((await handle(request(valid,'https://other.invalid'))).status,403);
 assert.equal(calls.length,0);
 const r=await handle(request(valid));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
 const data=await r.json();assert.equal(data.cases.length,50);assert.equal(data.next,id(149));assert.doesNotMatch(JSON.stringify(data),/ciphertext|do-not-return/);
 assert.deepEqual(calls[2][1],[id(1),id(2),id(3),null,null]);assert.equal(calls[1][0],'SET LOCAL ROLE sf_identity_queue_gateway');assert.equal(calls[3][0],'COMMIT');
});
test('missing session and unauthorized database proof fail closed',async()=>{
 const pool={connect:async()=>{throw Error('should not connect')}};
 assert.equal((await createIdentityQueueHandler({auth:{api:{getSession:async()=>null}},pool,origin})(request(valid))).status,401);
 const auth={api:{getSession:async()=>({user:{id:id(1),emailVerified:true},session:{id:id(2),userId:id(1),expiresAt:new Date(Date.now()+60000)}})}};
 const calls=[];const deny={connect:async()=>({query:async s=>{calls.push(s);if(s.startsWith('SELECT'))throw Object.assign(Error('private'),{code:'42501'});},release(){}})};
 const response=await createIdentityQueueHandler({auth,pool:deny,origin})(request(valid));assert.equal(response.status,403);assert.equal(calls.at(-1),'ROLLBACK');assert.deepEqual(await response.json(),{error:'not_permitted'});
});
