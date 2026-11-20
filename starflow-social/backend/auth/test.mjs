import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {authOptions,createStarflowAuthLab} from './auth.mjs';

const origin='https://starflow-auth-test.example';
const secret='synthetic-ci-secret-only-not-a-production-credential-3d91e8';
test('strict origin, credentials, closed registration, server-side sessions',()=>{
 const cfg={database:{},origin,secret};
 for(const bad of ['http://starflow-auth-test.example',origin+'/',origin+'/foo','https://user:pass@example.com','https://*.example.com/']){
  assert.throws(()=>authOptions({...cfg,origin:bad}));
 }
 assert.throws(()=>authOptions({...cfg,secret:'short'}));
 assert.throws(()=>authOptions({...cfg,database:null}));
 const o=authOptions(cfg);
 assert.equal(o.emailAndPassword.disableSignUp,true);
 assert.equal(o.emailAndPassword.requireEmailVerification,true);
 assert.equal(o.emailAndPassword.revokeSessionsOnPasswordReset,true);
 assert.equal(o.session.cookieCache.enabled,false);
 assert.equal(o.advanced.useSecureCookies,true);
 assert.equal(o.advanced.disableCSRFCheck,false);
 assert.equal(o.account.accountLinking.enabled,false);
 assert.deepEqual(o.trustedOrigins,[origin]);
 assert.equal(o.advanced.database.generateId,'uuid');
 assert.equal(o.rateLimit.storage,'database');
 assert.deepEqual(o.plugins.map(p=>p.id).sort(),['passkey','two-factor','username']);
});
test('real Better Auth migration and disabled public signup against disposable PostgreSQL',async()=>{
 const db=new pg.Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'ephemeral-ci-only',database:'starflow_auth_test'});
 try{
  const auth=createStarflowAuthLab({database:db,origin,secret});
  const migrations=await getMigrations(auth.options);
  await migrations.runMigrations();
  const tables=await db.query("select table_name from information_schema.tables where table_schema='public'");
  const names=tables.rows.map(r=>r.table_name);
  for(const name of ['user','session','account','verification','passkey','twoFactor','rateLimit']) assert.ok(names.includes(name),'missing table '+name);
  const req=new Request(origin+'/api/identity/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin,'cf-connecting-ip':'192.0.2.7'},body:JSON.stringify({email:'test@example.invalid',name:'Synthetic',username:'test_user',password:'synthetic-strong-password-66'})});
  const response=await auth.handler(req);
  assert.ok(response.status>=400 && response.status<500,'expected closed signup, got '+response.status);
  assert.equal(Number((await db.query('select count(*) as n from "user"')).rows[0].n),0);
 }finally{await db.end();}
});

test('disposable database: real signup, verification, login and session revocation; no mail network',async()=>{
 const db=new pg.Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'ephemeral-ci-only',database:'starflow_auth_test'});
 const o=authOptions({database:db,origin,secret});
 let verification, resetToken;
 // Deliberately override only in the offline test harness, not in auth.mjs or any live route.
 const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false,sendResetPassword:async({token})=>{resetToken=token;}},
   emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({url})=>{verification=url;}}});
 const email='fixture@example.invalid',password='synthetic-password-for-test-2026';
 const headers={'content-type':'application/json',origin,'cf-connecting-ip':'192.0.2.8'};
 const post=(path,body,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,
  {method:'POST',headers:{...headers,...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
 const read=(path,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{headers:{...headers,...(cookie?{cookie}:{})}}));
 try{
  await (await getMigrations(auth.options)).runMigrations();
  const sign=await post('sign-up/email',{name:'Synthetic Test',email,password,username:'fixture_user'});
  assert.ok(sign.ok,'signup status '+sign.status);
  assert.equal(typeof verification,'string','verification link was not produced');
  assert.equal(new URL(verification).origin,origin);
  assert.equal((await db.query('select "emailVerified" from "user" where email=$1',[email])).rows[0].emailVerified,false);
  const unverified=await post('sign-in/email',{email,password});
  assert.ok(unverified.status>=400 && unverified.status<500,'unverified login allowed');
  const verified=await auth.handler(new Request(verification,{headers}));
  assert.ok(verified.ok||verified.status===302,'verification failed '+verified.status);
  assert.equal((await db.query('select "emailVerified" from "user" where email=$1',[email])).rows[0].emailVerified,true);
  const invalid=await post('sign-in/email',{email,password:'wrong-password-for-test'});
  assert.ok(invalid.status>=400 && invalid.status<500,'incorrect password accepted');
  const signed=await post('sign-in/email',{email,password});
  assert.ok(signed.ok,'login status '+signed.status);
  const cookies=signed.headers.getSetCookie();
  const sessionCookie=cookies.find(v=>v.includes('session_token='));
  assert.ok(sessionCookie?.includes('HttpOnly')&&sessionCookie.includes('Secure'),'secure session cookie missing');
  const cookie=sessionCookie.split(';')[0];
  const session=await read('get-session',cookie);
  assert.equal((await session.json()).user.email,email);
  // Real provider challenge generation, not a simulated biometric success.
  await assert.rejects(()=>auth.api.generatePasskeyRegistrationOptions({headers:new Headers(headers)}));
  const regHeaders=new Headers({...headers,cookie});
  const options=await auth.api.generatePasskeyRegistrationOptions({headers:regHeaders});
  assert.equal(options.rp.id,new URL(origin).hostname);
  assert.equal(options.authenticatorSelection.userVerification,'required');
  assert.equal(typeof options.challenge,'string');
  assert.ok(options.challenge.length>=32);
  const second=await auth.api.generatePasskeyRegistrationOptions({headers:regHeaders});
  assert.notEqual(options.challenge,second.challenge);
  assert.equal(Number((await db.query('select count(*) as n from passkey')).rows[0].n),0,'challenge must not register credential');
  const out=await post('sign-out',{},cookie);
  assert.ok(out.ok,'signout failed');
  const revoked=await read('get-session',cookie);
  assert.equal(await revoked.json(),null);
 }finally{await db.end();}
});

test('separate recovery account: single-use reset token revokes sessions and old password',async()=>{
 const db=new pg.Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'ephemeral-ci-only',database:'starflow_auth_test'});
 const o=authOptions({database:db,origin,secret});
 let verification,resetToken;
 const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false,sendResetPassword:async({token})=>{resetToken=token;}},
 emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({url})=>{verification=url;}}});
 const email='recovery-fixture@example.invalid',password='synthetic-recovery-original-2026',newPassword='synthetic-recovery-replacement-2026';
 // Independent account and simulated device, not a relaxation of production rate limits.
 const headers={'content-type':'application/json',origin,'cf-connecting-ip':'192.0.2.19'};
 const post=(path,body)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers,body:JSON.stringify(body)}));
 try{
  await (await getMigrations(auth.options)).runMigrations();
  const signup=await post('sign-up/email',{name:'Recovery Fixture',email,password,username:'recovery_fixture'});
  assert.ok(signup.ok,'signup status '+signup.status);
  assert.ok(verification);
  const verified=await auth.handler(new Request(verification,{headers}));
  assert.ok(verified.ok||verified.status===302);
  const existing=await post('sign-in/email',{email,password});
  assert.ok(existing.ok,'initial login status '+existing.status);
  const oldCookie=existing.headers.getSetCookie().find(v=>v.includes('session_token=')).split(';')[0];
  const reset=await post('request-password-reset',{email,redirectTo:origin+'/reset-password'});
  assert.ok(reset.ok,'reset request status '+reset.status);
  assert.ok(typeof resetToken==='string'&&resetToken.length>0);
  const changed=await post('reset-password',{token:resetToken,newPassword});
  assert.ok(changed.ok,'reset status '+changed.status);
  const replay=await post('reset-password',{token:resetToken,newPassword:'synthetic-replay-password-2026'});
  assert.ok(replay.status>=400&&replay.status<500&&replay.status!==429,'reset replay must be rejected by validation, not throttling');
  const current=await auth.handler(new Request(origin+'/api/identity/auth/get-session',{headers:{...headers,cookie:oldCookie}}));
  assert.equal(await current.json(),null);
  const denied=await post('sign-in/email',{email,password});
  assert.ok(denied.status>=400&&denied.status<500&&denied.status!==429,'old password must fail validation');
  const next=await post('sign-in/email',{email,password:newPassword});
  assert.ok(next.ok,'new password login status '+next.status);
 }finally{await db.end();}
});
