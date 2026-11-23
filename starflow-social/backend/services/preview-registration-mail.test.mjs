import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewRegistrationMail} from './preview-registration-mail.mjs';
import {createFreshRegistrationMail} from '../auth/auth-mail.mjs';
const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
const env={STARFLOW_V2_PREVIEW_ONLY:'true',STARFLOW_V2_ENABLED:'true',
 STARFLOW_REGISTRATION_PREVIEW_ENABLED:'true',STARFLOW_FRESH_PREVIEW_ENABLED:'true',
 STARFLOW_BREVO_SEND_ENABLED:'true',STARFLOW_BREVO_BILLING_FREE_ONLY_VERIFIED:'true',
 STARFLOW_AUTH_ORIGIN:origin,BREVO_API_KEY:'test-key-not-live',
 STARFLOW_BREVO_SENDER_EMAIL:'security@example.invalid',
 STARFLOW_MAIL_RECIPIENT_SECRET:'independent-synthetic-hmac-only-receiver',
 BETTER_AUTH_SECRET:'independent-synthetic-auth-signing-only'};
const senderResult=()=>Response.json({senders:[{email:env.STARFLOW_BREVO_SENDER_EMAIL,active:true}]});
const planResult=()=>Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:300}],
 planVerticals:[{planType:'free',status:'active'}]});
test('no transport is configured without every independent preview and zero-charge gate',async()=>{
 let calls=0;const transport=async()=>{calls++;throw Error('must not request')};
 assert.equal(createPreviewRegistrationMail({}, {transport}),undefined);
 for(const name of ['STARFLOW_V2_PREVIEW_ONLY','STARFLOW_V2_ENABLED','STARFLOW_REGISTRATION_PREVIEW_ENABLED',
 'STARFLOW_FRESH_PREVIEW_ENABLED','STARFLOW_BREVO_SEND_ENABLED','STARFLOW_BREVO_BILLING_FREE_ONLY_VERIFIED']){
  assert.equal(createPreviewRegistrationMail({...env,[name]:'false'},{transport}),undefined,name);
  assert.equal(createPreviewRegistrationMail({...env,[name]:undefined},{transport}),undefined,name);
 }
 for(const patch of [{STARFLOW_PREVIEW_OWNER_KEY:'a'.repeat(64)},
  {STARFLOW_MAIL_RECIPIENT_SECRET:undefined},{STARFLOW_MAIL_RECIPIENT_SECRET:env.BREVO_API_KEY},
  {STARFLOW_MAIL_RECIPIENT_SECRET:env.BETTER_AUTH_SECRET},
  {STARFLOW_BREVO_SENDER_EMAIL:'attacker@example.invalid\r\n'},
  {STARFLOW_BREVO_SENDER_EMAIL:'not-an-email'},
  {STARFLOW_BREVO_SENDER_EMAIL:String.raw`security@example.invalid\\r\\n`},
  {BREVO_API_KEY:undefined},{STARFLOW_AUTH_ORIGIN:'https://weizai.weizai.workers.dev'},
  {STARFLOW_AUTH_ORIGIN:'http://'+new URL(origin).hostname}]){
  assert.equal(createPreviewRegistrationMail({...env,...patch},{transport}),undefined,JSON.stringify(Object.keys(patch)));
 }
 assert.equal(calls,0);
});
test('read-only provider sender attestation rejects failures, spoofed senders and malformed data',async()=>{
 const good=createPreviewRegistrationMail(env,{transport:async(url,opts)=>{
  assert.equal(url,'https://api.brevo.com/v3/senders');assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');assert.equal(opts.headers['api-key'],env.BREVO_API_KEY);
  return senderResult();
 }});
 assert.deepEqual(Object.keys(good),['apiKey','sender','recipientSecret','verifyBilling','transport']);
 assert.equal(await good.verifyBilling(),true);
 for(const response of [
  Response.json({senders:[{email:'other@example.invalid',active:true}]}),
  Response.json({senders:[{email:env.STARFLOW_BREVO_SENDER_EMAIL,active:false}]}),
  Response.json({senders:[{email:env.STARFLOW_BREVO_SENDER_EMAIL,active:'true'}]}),
  Response.json({senders:'not-an-array'}),
  Response.json({senders:[{email:env.STARFLOW_BREVO_SENDER_EMAIL,active:true}]},{status:429}),
  new Response('not-json',{headers:{'content-type':'text/plain'}}),
  new Response('{broken',{headers:{'content-type':'application/json'}}),
  new Response('x'.repeat(33000),{headers:{'content-type':'application/json'}})
 ]){
  const a=createPreviewRegistrationMail(env,{transport:async()=>response});
  assert.equal(await a.verifyBilling(),false);
 }
 const failed=createPreviewRegistrationMail(env,{transport:async()=>{throw Error('private provider detail')}});
 assert.equal(await failed.verifyBilling(),false);
 assert.equal(createPreviewRegistrationMail(env,{transport:undefined})!==undefined,true); // default fetch is not invoked
});
test('fully authorized fixture sends only after active sender, live Free plan and committed budget',async()=>{
 const calls=[];
 const transport=async(url,opts)=>{
  if(url.endsWith('/senders')){calls.push('sender');assert.equal(opts.method,'GET');return senderResult();}
  if(url.endsWith('/account')){calls.push('free_plan');assert.equal(opts.method,'GET');return planResult();}
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');
  calls.push('send');assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).to[0].email,'member@example.invalid');
  return Response.json({messageId:'synthetic-only'},{status:201});
 };
 const registrationMail=createPreviewRegistrationMail(env,{transport});
 const pool={connect:async()=>({query:async(sql,args)=>{
  if(sql==='BEGIN')calls.push('begin');
  if(sql==='COMMIT')calls.push('commit');
  if(sql.startsWith('SELECT')){assert.match(args[1],/^[a-f0-9]{64}$/);return {rows:[{allowed:true}]};}
 },release(){}})};
 const mail=createFreshRegistrationMail({...registrationMail,enabled:true,pool,origin,
  allowRecipient:async s=>s.id==='11111111-1111-4111-8111-111111111111'&&s.email==='member@example.invalid'&&s.purpose==='verify'});
 await mail.sendVerificationEmail({
  user:{id:'11111111-1111-4111-8111-111111111111',email:'member@example.invalid',emailVerified:false},
  token:'synthetic-token',url:origin+'/api/identity/auth/verify-email?token=synthetic-token'
 });
 assert.deepEqual(calls,['sender','free_plan','begin','commit','send']);
});
test('inactive sender and non-free plan cannot cause a budget reservation or send',async()=>{
 const examples=[
  {sender:()=>Response.json({senders:[]}),plan:planResult},
  {sender:senderResult,plan:()=>Response.json({enterprise:true,relay:{enabled:true},plan:[{type:'paid',creditsType:'sendLimit',credits:999}]})}
 ];
 for(const example of examples){
  let reservations=0,sends=0;
  const transport=async(url)=>{
   if(url.endsWith('/senders'))return example.sender();
   if(url.endsWith('/account'))return example.plan();
   sends++;throw Error('unexpected live mail');
  };
  const reg=createPreviewRegistrationMail(env,{transport});
  const mail=createFreshRegistrationMail({...reg,enabled:true,origin,pool:{connect:async()=>{reservations++;throw Error('unexpected quota')}} ,
   allowRecipient:async()=>true});
  await mail.sendVerificationEmail({
   user:{id:'11111111-1111-4111-8111-111111111111',email:'member@example.invalid',emailVerified:false},
   token:'synthetic-token',url:origin+'/api/identity/auth/verify-email?token=synthetic-token'
  });
  assert.equal(reservations,0);assert.equal(sends,0);
 }
});
