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
