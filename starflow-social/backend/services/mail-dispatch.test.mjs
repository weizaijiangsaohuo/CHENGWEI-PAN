import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMailDispatcher} from './mail-dispatch.mjs';
const event={eventId:'11111111-1111-4111-8111-111111111111',purpose:'verify',link:'https://example.invalid/api/identity/auth/verify-email?token=fixture'};
const config={enabled:true,apiKey:'synthetic',sender:'security@example.invalid',origin:'https://example.invalid',recipientSecret:'synthetic-test-secret-not-a-real-secret',
 authorize:async()=> 'user@example.invalid',confirmFreePlan:async()=>true,reserve:async()=>true,transport:async()=>Response.json({messageId:'synthetic-id'},{status:201})};
test('disabled or paid-plan uncertainty causes no reservation or network request',async()=>{
 let touched=0;
 const traps={reserve:async()=>{touched++;return true},transport:async()=>{touched++;throw Error('network')}};
 assert.deepEqual(await createMailDispatcher({...config,...traps,enabled:false})(event),{status:'disabled'});
 assert.deepEqual(await createMailDispatcher({...config,...traps,confirmFreePlan:async()=>false})(event),{status:'disabled'});
 assert.equal(touched,0);
});
test('recipient resolution, quota commit, then a single authorized request',async()=>{
 const calls=[];
 const dispatch=createMailDispatcher({...config,authorize:async()=>{calls.push('authorize');return 'user@example.invalid'},reserve:async args=>{calls.push('reserve');assert.equal(args.eventId,event.eventId);assert.match(args.recipientKey,/^[0-9a-f]{64}$/);assert.equal(args.purpose,'verify');assert.doesNotMatch(JSON.stringify(args),/user@example/);return true},
 transport:async(url,opts)=>{calls.push('send');assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(opts.redirect,'error');assert.equal(JSON.parse(opts.body).to[0].email,'user@example.invalid');return Response.json({messageId:'fixture'},{status:201})}});
 assert.deepEqual(await dispatch({...event,recipient:'attacker@example.invalid'}),{status:'accepted'});
 assert.deepEqual(calls,['authorize','reserve','send']);
});
test('quota denial, invalid link and unknown transport outcomes fail closed',async()=>{
 let calls=0;
 const guarded=createMailDispatcher({...config,reserve:async()=>false,transport:async()=>{calls++;throw Error('fixture')}});
 assert.deepEqual(await guarded(event),{status:'quota_denied'});
 assert.equal(calls,0);
 const broken=createMailDispatcher({...config,transport:async()=>{calls++;throw Error('private provider detail')}});
 assert.deepEqual(await broken(event),{status:'unconfirmed'});
 assert.equal(calls,1);
 assert.deepEqual(await broken({...event,link:'https://attacker.invalid/?token=fixture'}),{status:'unconfirmed'});
 assert.equal(calls,1);
 const invalid=createMailDispatcher({...config,transport:async()=>Response.json({},{status:201})});
 assert.deepEqual(await invalid(event),{status:'unconfirmed'});
});

test('provider acceptance requires bounded JSON and a nonblank receipt; no repeat attempt',async()=>{
 const json=body=>Response.json(body,{status:201});
 const cases=[
  ['valid',()=>json({messageId:'fixture'}),'accepted'],
  ['wrong MIME',()=>new Response('{"messageId":"fixture"}',{status:201,headers:{'content-type':'text/html'}}),'unconfirmed'],
  ['blank ID',()=>json({messageId:'  '}),'unconfirmed'],
  ['long ID',()=>json({messageId:'x'.repeat(513)}),'unconfirmed'],
  ['oversized body',()=>json({messageId:'fixture',extra:'x'.repeat(5000)}),'unconfirmed'],
  ['malformed JSON',()=>new Response('{broken',{status:201,headers:{'content-type':'application/json'}}),'unconfirmed'],
  ['invalid UTF-8',()=>new Response(new Uint8Array([255]),{status:201,headers:{'content-type':'application/json'}}),'unconfirmed'],
  ['redirected response',()=>{const response=json({messageId:'fixture'});Object.defineProperty(response,'redirected',{value:true});return response;},'unconfirmed'],
  ['rate limited',()=>Response.json({messageId:'fixture'},{status:429}),'unconfirmed'],
  ['provider failure',()=>Response.json({messageId:'fixture'},{status:503}),'unconfirmed'],
  ['empty body',()=>new Response(null,{status:201,headers:{'content-type':'application/json'}}),'unconfirmed']
 ];
 for(const [name,reply,status] of cases){
  let reservations=0,attempts=0;
  const dispatch=createMailDispatcher({...config,reserve:async()=>{reservations++;return true},transport:async()=>{attempts++;return reply()}});
  assert.deepEqual(await dispatch(event),{status},name);
  assert.equal(reservations,1,name);assert.equal(attempts,1,name);
 }
});
test('revoked recipient after reservation cannot cause delivery or refund',async()=>{
 let checks=0,reservations=0,attempts=0;
 const dispatch=createMailDispatcher({...config,recheckRecipient:true,
  authorize:async()=>++checks===1?'user@example.invalid':null,
  reserve:async()=>{reservations++;return true},
  transport:async()=>{attempts++;throw Error('must not send')}
 });
 assert.deepEqual(await dispatch(event),{status:'rejected'});
 assert.equal(checks,2);assert.equal(reservations,1);assert.equal(attempts,0);
});
test('a repeated event is stopped by the shared reservation even after uncertain transport',async()=>{
 const seen=new Set();let attempts=0;
 const dispatch=createMailDispatcher({...config,
  reserve:async({eventId})=>{if(seen.has(eventId))return false;seen.add(eventId);return true;},
  transport:async()=>{attempts++;throw Error('synthetic timeout')}
 });
 assert.deepEqual(await dispatch(event),{status:'unconfirmed'});
 assert.deepEqual(await dispatch(event),{status:'quota_denied'});
 assert.equal(attempts,1);
});
