import {test} from 'node:test';import assert from 'node:assert/strict';import {provisionFreshAccount} from './fresh-account.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('uses only verified session and restricted provisioning function',async()=>{
 const calls=[];const headers=new Headers({'x-user-id':id(9)});
 const session={user:{id:id(1),emailVerified:true},session:{id:id(2),userId:id(1),expiresAt:new Date(Date.now()+60000)}};
 const auth={api:{getSession:async({headers:h})=>{assert.equal(h,headers);return session;}}};
 const pool={connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{principal:id(3)}]};},release:discard=>assert.equal(discard,false)})};
 assert.deepEqual(await provisionFreshAccount({auth,pool,headers}),{status:'created',principal:id(3)});
 assert.deepEqual(calls.map(x=>x[0]),['BEGIN','SET LOCAL ROLE sf_fresh_account_gateway','SELECT sf_core.provision_fresh_account($1,$2) AS principal','COMMIT']);
 assert.deepEqual(calls[2][1],[id(1),id(2)]);
 session.user.emailVerified=false;assert.equal((await provisionFreshAccount({auth,pool,headers})).status,'not_permitted');assert.equal(calls.length,4);
});
test('missing or rejected admission cannot claim a profile',async()=>{
 const calls=[];const auth={api:{getSession:async()=>({user:{id:id(1),emailVerified:true},session:{id:id(2),userId:id(1),expiresAt:new Date(Date.now()+60000)}})}};
 const pool={connect:async()=>({query:async sql=>{calls.push(sql);return {rows:[{principal:null}]};},release(){}})};
 assert.deepEqual(await provisionFreshAccount({auth,pool,headers:new Headers()}),{status:'not_permitted'});assert.equal(calls.at(-1),'ROLLBACK');
});
