import {test} from 'node:test';import assert from 'node:assert/strict';import {createOrdinaryRecoveryPolicy} from './account-recovery-policy.mjs';
const id='11111111-1111-4111-8111-111111111111',email='fixture@example.invalid';
test('reset checks exact subject and email; OTP checks subject; no direct table access',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{allowed:true}]}},release(discard){assert.equal(discard,false)}})};
 const p=createOrdinaryRecoveryPolicy(pool);
 assert.equal(await p.allowResetRecipient({purpose:'verify',id,email}),false);
 assert.equal(await p.allowResetRecipient({purpose:'reset',id:'bad',email}),false);
 assert.equal(calls.length,0);
 assert.equal(await p.allowResetRecipient({purpose:'reset',id,email}),true);
 assert.equal(await p.allowOtpSubject(id),true);
 assert.deepEqual(calls.filter(([sql])=>sql.startsWith('SELECT')).map(([,args])=>args),[[id,email],[id,null]]);
 assert.deepEqual(calls.map(([sql])=>sql),[...Array(2)].flatMap(()=>['BEGIN READ ONLY','SET LOCAL ROLE sf_account_recovery_gateway','SELECT sf_core.ordinary_recovery_allowed($1,$2) AS allowed','COMMIT']));
});
test('denials and database failures are fail closed',async()=>{
 for(const mode of ['deny','empty','fail']){
  const p=createOrdinaryRecoveryPolicy({connect:async()=>({query:async sql=>{if(mode==='fail'&&sql==='COMMIT')throw Error('fixture');return {rows:mode==='empty'?[]:[{allowed:mode==='fail'}]};},release(){}})});
  assert.equal(await p.allowOtpSubject(id),false);
 }
});
