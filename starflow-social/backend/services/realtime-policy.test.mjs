import {test} from 'node:test';import assert from 'node:assert/strict';import {authorizeUpgrade,syncHint} from './realtime-policy.mjs';
const origin='https://example.invalid',now=Date.now(),subject='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',principal='33333333-3333-4333-8333-333333333333';
const request=(url=origin+'/api/realtime',from=origin)=>new Request(url,{headers:{origin:from,upgrade:'websocket','x-user-id':sid}});
const auth={api:{getSession:async()=>({user:{id:subject,emailVerified:true},session:{id:sid,userId:subject,expiresAt:new Date(now+120000)}})}};
const config={request:request(),origin,auth,resolvePrincipal:async()=>principal,now};
test('same-origin verified session only, bounded expiry and no data in hints',async()=>{
 const grant=await authorizeUpgrade(config);
 assert.equal(grant.principal,principal);assert.equal(grant.expiresAt,now+60000);
 assert.equal(syncHint(grant,grant,now),'{"type":"sync_available"}');
 for(const patch of [{request:request(origin+'/api/realtime?token=secret')},{request:request(undefined,'https://evil.invalid')},{resolvePrincipal:async()=>null},{auth:{api:{getSession:async()=>null}}}])assert.equal(await authorizeUpgrade({...config,...patch}),null);
 assert.equal(syncHint(grant,{...grant,sessionId:subject},now),null);
 assert.equal(syncHint(grant,grant,now+60000),null);
 assert.equal(syncHint(grant,null,now),null);
});
