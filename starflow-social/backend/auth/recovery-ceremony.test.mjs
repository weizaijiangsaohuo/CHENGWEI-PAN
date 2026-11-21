import {test} from 'node:test';import assert from 'node:assert/strict';import {hasRecoveryEvidence} from './recovery-ceremony.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=1795260000000;
const fixture=()=>({now,attempt:{id:id(1),selectedSubject:id(2),providerSessionId:id(3),purpose:'password_reset',method:'account',state:'selected',consumed:false,createdAt:now-120000,expiresAt:now+300000},
 account:{subject:id(2),enrollmentId:id(4),active:true,freshAccount:true,identityVerified:true,recoveryConsent:true,enrollmentActive:true,staff:false,mfaEnabled:false},
 possession:{id:id(5),attemptId:id(1),subject:id(2),kind:'verified_contact',verified:true,consumed:false,verifiedAt:now-90000},
 proof:{id:id(6),attemptId:id(1),subject:id(2),sessionId:id(3),enrollmentId:id(4),purpose:'password_reset',source:'authenticated_provider',environment:'sandbox',signatureVerified:true,verifiedAt:now-60000,liveness:'ACTIVE_3D',sameEnrolledPerson:true,status:'approved',warnings:[],consumed:false}});
test('both entry methods require the same evidence and never mint a token',()=>{
 const f=fixture();assert.equal(hasRecoveryEvidence(f),true);
 f.attempt.method='verified_identity';f.possession.kind='recovery_code';assert.equal(hasRecoveryEvidence(f),true);
});
test('reject cross-account, replay, expired, withdrawn, staff, MFA and unverified provider results',()=>{
 for(const [record,patch] of [
 ['attempt',{selectedSubject:id(9)}],['attempt',{expiresAt:now}],['attempt',{createdAt:now-20*60000}],['attempt',{consumed:true}],['attempt',{method:'email_only'}],
 ['account',{staff:true}],['account',{mfaEnabled:true}],['account',{identityVerified:false}],['account',{recoveryConsent:false}],['account',{enrollmentActive:false}],['account',{active:false}],['account',{freshAccount:false}],
 ['possession',{kind:'identity_number'}],['possession',{subject:id(9)}],['possession',{consumed:true}],['possession',{verified:false}],['possession',{verifiedAt:now+1}],
 ['proof',{sessionId:id(9)}],['proof',{enrollmentId:id(9)}],['proof',{attemptId:id(9)}],['proof',{subject:id(9)}],['proof',{consumed:true}],['proof',{signatureVerified:false}],['proof',{source:'browser'}],['proof',{environment:'live'}],['proof',{sameEnrolledPerson:false}],['proof',{liveness:'PASSIVE'}],['proof',{warnings:['fixture warning']}],['proof',{status:'review'}],['proof',{verifiedAt:now-180000}]
 ]){const f=fixture();Object.assign(f[record],patch);assert.equal(hasRecoveryEvidence(f),false,record+JSON.stringify(patch));}
 for(const key of ['account','attempt','proof','possession']){const f=fixture();delete f[key];assert.equal(hasRecoveryEvidence(f),false);}
});
