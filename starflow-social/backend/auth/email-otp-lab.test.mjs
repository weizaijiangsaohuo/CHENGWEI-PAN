import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {createEmailOtpLab} from './email-otp-lab.mjs';
test('actual email OTP signup, login, one-use code, protected account rejection; no network sends',async()=>{
 const db=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'postgres',password:'ephemeral-ci-only'});
 const origin='https://email-otp-fixture.example.invalid',email='otp-fixture@example.invalid';
 let latest,blocked=false,sends=0,ip='192.0.2.91';
 const app=createEmailOtpLab({database:db,origin,secret:'synthetic-otp-auth-secret-not-real-2026',otpSecret:'independent-synthetic-otp-key-not-real-2026',allowSignup:true,
  allowSubject:async()=>!blocked,send:async x=>{assert.equal(x.email,email);assert.match(x.otp,/^\d{6}$/);latest=x.otp;sends++;}});
 const call=(path,body)=>app.handle(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(body)}));
 const issue=()=>call('email-otp/send-verification-otp',{email,type:'sign-in'});
 const login=otp=>call('sign-in/email-otp',{email,otp,name:'OTP fixture'});
 try{
  assert.equal((await call('email-otp/send-verification-otp',{email,type:'forget-password'})).status,400);
  assert.ok((await issue()).ok);assert.equal(sends,1);
  const code=latest;
  const stored=await db.query("SELECT value FROM verification WHERE identifier LIKE $1",['%'+email+'%']);
  assert.ok(stored.rowCount>0);assert.ok(stored.rows.every(x=>!String(x.value).startsWith(code+':')));
  const wrong=String((Number(code)+1)%1000000).padStart(6,'0');
  assert.ok(!(await login(wrong)).ok);
  const signed=await login(code);assert.ok(signed.ok,'signup '+signed.status);
  const user=(await signed.json()).user;assert.equal(user.email,email);assert.equal(user.emailVerified,true);
  assert.ok(signed.headers.getSetCookie().some(x=>x.includes('session_token=')&&x.includes('HttpOnly')&&x.includes('Secure')));
  const replay=await login(code);assert.ok(!replay.ok&&replay.status!==429,'OTP reuse must fail independently of rate limit');
  ip='192.0.2.92';assert.ok((await issue()).ok);
  const again=await login(latest);assert.ok(again.ok,'login '+again.status);assert.equal((await again.json()).user.id,user.id);
  const count=async()=>Number((await db.query('SELECT count(*) AS n FROM session WHERE "userId"=$1',[user.id])).rows[0].n);
  const n=await count();
  blocked=true;ip='192.0.2.93';assert.ok((await issue()).ok);
  const denied=await login(latest);assert.ok(!denied.ok);assert.equal(await count(),n,'privileged account must not get a session');
  blocked=false;await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1',[user.id]);
  ip='192.0.2.94';assert.ok((await issue()).ok);assert.ok(!(await login(latest)).ok);assert.equal(await count(),n,'MFA account must not get an OTP session');
 }finally{await db.end();}
});
