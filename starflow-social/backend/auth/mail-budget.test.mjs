import {test} from 'node:test';import assert from 'node:assert/strict';import {createMailBudgetReservation} from './mail-budget.mjs';import {createMailDispatcher} from '../services/mail-dispatch.mjs';
const eventId='11111111-1111-4111-8111-111111111111';
test('mail transport starts only after committed reservation; failed commit never sends',async()=>{
 for(const fail of [false,true]){
  const order=[];let released=false;
  const pool={connect:async()=>({query:async(sql,args)=>{order.push(sql.split(' ')[0]);if(sql.startsWith('SELECT')){assert.equal(args[0],eventId);assert.match(args[1],/^[a-f0-9]{64}$/);assert.equal(args[2],'verify');return {rows:[{allowed:true}]};}if(sql==='COMMIT'&&fail)throw Error('uncertain commit');},release(discard){released=true;assert.equal(discard,fail)}})};
  const dispatch=createMailDispatcher({enabled:true,apiKey:'fixture',sender:'security@example.invalid',origin:'https://example.invalid',recipientSecret:'synthetic-key-for-ci-not-a-real-key',authorize:async()=> 'user@example.invalid',confirmFreePlan:async()=>true,reserve:createMailBudgetReservation(pool),transport:async()=>{order.push('SEND');return Response.json({messageId:'fixture'},{status:201});}});
  const result=await dispatch({eventId,purpose:'verify',link:'https://example.invalid/api/identity/auth/verify-email?token=fixture'});
  assert.equal(result.status,fail?'quota_denied':'accepted');assert.deepEqual(order,fail?['BEGIN','SET','SELECT','COMMIT','ROLLBACK']:['BEGIN','SET','SELECT','COMMIT','SEND']);assert.ok(released);
 }
});
test('invalid envelopes deny before connecting',async()=>{
 const reserve=createMailBudgetReservation({connect:async()=>{throw Error('unexpected')}});
 assert.equal(await reserve({eventId,recipientKey:'user@example.invalid',purpose:'otp'}),false);
});
