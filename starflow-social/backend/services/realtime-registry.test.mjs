import {test} from 'node:test';import assert from 'node:assert/strict';import {createRealtimeRegistry} from './realtime-registry.mjs';
class FakeSocket extends EventTarget{sent=[];closed=false;send(x){this.sent.push(x);}close(){this.closed=true;this.dispatchEvent(new Event('close'));}}
test('bounded targeted hint transport without content, revalidates before sending',async()=>{
 let now=1000;const r=createRealtimeRegistry({maxTotal:2,maxPerPrincipal:1,clock:()=>now});
 const a={principal:'a',subject:'s',sessionId:'session-a',expiresAt:now+60000},b={...a,principal:'b',sessionId:'session-b'};
 const x=new FakeSocket(),y=new FakeSocket(),z=new FakeSocket();let current=a;
 assert.equal(r.attach(x,a,async()=>current),true);assert.equal(r.attach(z,a,async()=>a),false);
 assert.equal(r.attach(y,b,async()=>b),true);assert.equal(r.attach(z,{...b,principal:'c'},async()=>b),false);
 await r.notify('a');assert.deepEqual(x.sent,['{"type":"sync_available"}']);assert.deepEqual(y.sent,[]);
 current=null;await r.notify('a');assert.equal(x.closed,true);assert.equal(x.sent.length,1);
 now+=60000;r.sweep();assert.equal(y.closed,true);assert.equal(r.size,0);
});
