import {test} from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {sealEvidence,openEvidence} from './identity-vault.mjs';
const key=randomBytes(32),binding={attemptId:'11111111-1111-4111-8111-111111111111',kind:'face_photo',keyId:'fixture-v1'},bytes=Buffer.from('synthetic-only');
test('authenticated encryption binds evidence to attempt, category and key',()=>{
 const a=sealEvidence(key,binding,bytes),b=sealEvidence(key,binding,bytes);
 assert.notDeepEqual(a.nonce,b.nonce);assert.notDeepEqual(a.ciphertext,bytes);
 assert.deepEqual(openEvidence(key,binding,a),bytes);
 for(const patch of [{attemptId:'22222222-2222-4222-8222-222222222222'},{kind:'document_front'},{keyId:'fixture-v2'}])assert.throws(()=>openEvidence(key,{...binding,...patch},a));
 assert.throws(()=>openEvidence(randomBytes(32),binding,a));
 const damaged=Buffer.from(a.ciphertext);damaged[0]^=1;
 assert.throws(()=>openEvidence(key,binding,{...a,ciphertext:damaged}));
});
test('limit payloads and reject invalid context',()=>{
 assert.throws(()=>sealEvidence(key,binding,Buffer.alloc(2097153)));
 assert.throws(()=>sealEvidence(key,{...binding,kind:'identity_fields'},Buffer.alloc(16385)));
 assert.throws(()=>sealEvidence(key,{...binding,kind:'public_photo'},bytes));
});
