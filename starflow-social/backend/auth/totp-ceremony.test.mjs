import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
// Independent RFC 6238 generator for synthetic test enrolment only; not a production verifier.
function codeFromURI(uri,now=Date.now()){
 const url=new URL(uri),s=url.searchParams.get('secret').toUpperCase().replace(/=+$/,'');
 let bits=0,value=0;const bytes=[];
 for(const ch of s){const v='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch);if(v<0)throw Error('invalid fixture secret');value=(value<<5)|v;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/1000/Number(url.searchParams.get('period')||30))));
 const mac=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=mac.at(-1)&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
test('real TOTP enrollment and second factor sign-in, no trusted-device bypass',async()=>{
 const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'postgres',password:'ephemeral-ci-only'});
 const origin='https://totp-fixture.example.invalid',secret='synthetic-totp-lab-only-not-a-real-secret';
 const email='totp-fixture@example.invalid',password='synthetic-totp-password-2026';
 let verify;
 const o=authOptions({database:pool,origin,secret});
 const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false},emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({url})=>{verify=url;}}});
 const jar=new Map();
 const cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 function absorb(res){for(const line of res.headers.getSetCookie()){const pair=line.split(';')[0],i=pair.indexOf('=');if(i<1)continue;const k=pair.slice(0,i),v=pair.slice(i+1);if(!v||/Max-Age=0(?:;|$)/i.test(line))jar.delete(k);else jar.set(k,v);}}
 const headers=()=>({origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.61',cookie:cookie()});
 const post=async(path,body)=>{const r=await auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:headers(),body:JSON.stringify(body)}));absorb(r);return r;};
 const session=()=>auth.api.getSession({headers:new Headers(headers())});
 try{
  assert.ok((await post('sign-up/email',{name:'TOTP fixture',username:'totp_fixture',email,password})).ok);
  assert.ok(verify);const confirmed=await auth.handler(new Request(verify,{headers:headers()}));assert.ok(confirmed.ok||confirmed.status===302);
  assert.ok((await post('sign-in/email',{email,password})).ok);
  assert.equal((await session()).user.email,email);
  const enrolled=await post('two-factor/enable',{password,method:'totp'});assert.ok(enrolled.ok,'enrollment status '+enrolled.status);
  const data=await enrolled.json();assert.equal(typeof data.totpURI,'string');assert.ok(data.backupCodes?.length);
  const uri=data.totpURI;
  const verified=await post('two-factor/verify-totp',{code:codeFromURI(uri),trustDevice:false});assert.ok(verified.ok,'enrollment verification '+verified.status);
  assert.equal((await pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE email=$1',[email])).rows[0].twoFactorEnabled,true);
  assert.ok((await post('sign-out',{})).ok);jar.clear();
  const login=await post('sign-in/email',{email,password});assert.ok(login.ok,'password phase '+login.status);
  const pending=await login.json();assert.equal(pending.twoFactorRedirect,true);
  assert.equal(await session(),null,'password-only session must remain unavailable');
  const correct=codeFromURI(uri);const wrong=String((Number(correct)+1)%1000000).padStart(6,'0');
  const fail=await post('two-factor/verify-totp',{code:wrong,trustDevice:false});assert.ok(fail.status>=400&&fail.status<500&&fail.status!==429);
  assert.equal(await session(),null);
  const success=await post('two-factor/verify-totp',{code:codeFromURI(uri),trustDevice:false});assert.ok(success.ok,'TOTP login '+success.status);
  assert.equal((await session()).user.email,email);
 }finally{await pool.end();}
});
