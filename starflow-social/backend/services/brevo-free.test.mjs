import {test} from 'node:test';import assert from 'node:assert/strict';import {freeMailPlan,createBrevoFreeDispatcher} from './brevo-free.mjs';
const plan=()=>({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:250}]});
const event={eventId:'11111111-1111-4111-8111-111111111111',purpose:'verify',link:'https://example.invalid/api/identity/auth/verify-email?token=fixture'};
const cfg={enabled:true,apiKey:'fixture-only',sender:'security@example.invalid',origin:'https://example.invalid',recipientSecret:'synthetic-recipient-secret-not-real',authorize:async()=> 'user@example.invalid'};
test('only unambiguous free email credits and enabled relay pass read-only check',()=>{
 assert.equal(freeMailPlan(plan()),true);
 for(const v of [null,{}, {...plan(),enterprise:true},{...plan(),relay:{enabled:false}},{...plan(),plan:[]},{...plan(),plan:[{...plan().plan[0],credits:0}]},{...plan(),plan:[{...plan().plan[0],type:'paid'}]},{...plan(),plan:[...plan().plan,{type:'sms'}]},{...plan(),planVerticals:[{planType:'paid',status:'active'}]}])assert.equal(freeMailPlan(v),false);
});
test('independent billing verification, plan read, committed quota, then one send',async()=>{
 const steps=[];
 const dispatch=createBrevoFreeDispatcher({...cfg,verifyBilling:async()=>{steps.push('billing');return true},reserve:async()=>{steps.push('reserve');return true},transport:async(url,opts)=>{
  assert.equal(opts.redirect,'error');assert.equal(opts.headers['api-key'],'fixture-only');
  if(opts.method==='GET'){assert.equal(url,'https://api.brevo.com/v3/account');steps.push('plan');return Response.json(plan());}
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');steps.push('send');return Response.json({messageId:'fixture'},{status:201});
 }});
 assert.deepEqual(await dispatch(event),{status:'accepted'});assert.deepEqual(steps,['billing','plan','reserve','send']);
});
test('no send or reservation for uncertain billing, paid or malformed account results',async()=>{
 for(const [verifyBilling,reply] of [[undefined,()=>Response.json(plan())],[async()=>false,()=>Response.json(plan())],[async()=>true,()=>Response.json({...plan(),enterprise:true})],[async()=>true,()=>new Response('too large'.repeat(10000),{headers:{'content-type':'application/json'}})],[async()=>true,()=>new Response(null,{status:429})],[async()=>true,()=>{throw Error('provider detail')}]]){
  let calls=0;
  const d=createBrevoFreeDispatcher({...cfg,verifyBilling,confirmFreePlan:async()=>true,reserve:async()=>{throw Error('must not reserve')},transport:async(url,opts)=>{calls++;assert.equal(opts.method,'GET');return reply();}});
  assert.deepEqual(await d(event),{status:'disabled'});assert.equal(calls,typeof verifyBilling==='function'&&await verifyBilling()===true?1:0);
 }
});
