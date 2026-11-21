import {test} from 'node:test';import assert from 'node:assert/strict';import {createRealtimeRegistry} from './realtime-registry.mjs';
class FakeSocket extends EventTarget{sent=[];closed=false;send(x){this.sent.push(x);}close(){this.closed=true;this.dispatchEvent(new Event('close'));}}
test('bounded targeted hint transport without content, revalidates before sending',async()=>{
 let now=1000;const r=createRealtimeRegistry({maxTotal:2,maxPerPrincipal:1,clock:()=>now});
 const a={principal:'11111111-1111-4111-8111-111111111111',subject:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',expiresAt:now+60000},b={...a,principal:'44444444-4444-4444-8444-444444444444',sessionId:'55555555-5555-4555-8555-555555555555'};
 const x=new FakeSocket(),y=new FakeSocket(),z=new FakeSocket();let current=a;
 assert.equal(r.attach(x,a,async()=>current),true);assert.equal(r.attach(z,a,async()=>a),false);
 assert.equal(r.attach(y,b,async()=>b),true);assert.equal(r.attach(z,{...b,principal:'c'},async()=>b),false);
 await r.notify(a.principal);assert.deepEqual(x.sent,['{"type":"sync_available"}']);assert.deepEqual(y.sent,[]);
 current=null;await r.notify(a.principal);assert.equal(x.closed,true);assert.equal(x.sent.length,1);
 now+=60000;r.sweep();assert.equal(y.closed,true);assert.equal(r.size,0);
});

test('immutable grant, duplicate socket, malformed expiry and revalidation denied',async()=>{
 const now=1000,r=createRealtimeRegistry({clock:()=>now});
 const a={principal:'11111111-1111-4111-8111-111111111111',subject:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',expiresAt:now+60000};
 const b={...a,principal:'44444444-4444-4444-8444-444444444444'};
 const x=new FakeSocket(),y=new FakeSocket();let current={...a};
 for(const expiry of [NaN,Infinity,undefined,'61000',now,now+60001])
  assert.equal(r.attach(y,{...a,expiresAt:expiry},async()=>a),false);
 assert.equal(r.attach(y,{...a,subject:'not-a-uuid'},async()=>a),false);
 assert.equal(r.attach(x,a,async()=>current),true);
 assert.equal(r.attach(x,b,async()=>b),false);
 a.principal=b.principal;
 await r.notify(b.principal);assert.equal(x.sent.length,0);
 await r.notify(current.principal);assert.equal(x.sent.length,1);
 current={...current,expiresAt:NaN};
 await r.notify(current.principal);assert.equal(x.closed,true);assert.equal(x.sent.length,1);
 assert.equal(r.attach(x,b,async()=>b),false);
});
