import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
import {createIdentityStepupHandler} from './identity-stepup.mjs';
import {createIdentityQueueHandler} from './identity-queue.mjs';
// Independent RFC 6238 generator for synthetic test enrolment only; not a production verifier.
function codeFromURI(uri,now=Date.now()){
 const url=new URL(uri),s=url.searchParams.get('secret').toUpperCase().replace(/=+$/,'');
 let bits=0,value=0;const bytes=[];
 for(const ch of s){const v='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch);if(v<0)throw Error('invalid fixture secret');value=(value<<5)|v;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/1000/Number(url.searchParams.get('period')||30))));
 const mac=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=mac.at(-1)&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
test('real TOTP enrollment and second factor sign-in, no trusted-device bypass, and identity queue step-up',async()=>{
 const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'postgres',password:'ephemeral-ci-only'});
 const origin='https://totp-fixture.example.invalid',secret='synthetic-totp-lab-only-not-a-real-secret';
 const email='totp-fixture@example.invalid',password='synthetic-totp-password-2026';
 let verify,issuerPool,queuePool;
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
  const current=await session(),actor=randomUUID(),subject=randomUUID(),attempt=randomUUID();
  await pool.query('INSERT INTO sf_core.principals(id) VALUES($1),($2)',[actor,subject]);
  await pool.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2)',[actor,current.user.id]);
  await pool.query("INSERT INTO sf_core.staff_roles VALUES($1,'founder',true)",[actor]);
  await pool.query('INSERT INTO sf_core.identity_evidence_reviewers VALUES($1,true)',[actor]);
  await pool.query('INSERT INTO sf_core.identity_attempts(id,principal_id,workflow_id,workflow_version) VALUES($1,$2,$3,1)',[attempt,subject,randomUUID()]);
  // Disposable CI login roles only. Production roles remain NOLOGIN.
  await pool.query("CREATE ROLE sf_identity_issuer_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'ci-identity-issuer-only'");
  await pool.query("CREATE ROLE sf_identity_queue_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'ci-identity-queue-only'");
  await pool.query('GRANT sf_identity_proof_issuer TO sf_identity_issuer_fixture WITH SET TRUE, INHERIT FALSE');
  await pool.query('GRANT sf_identity_queue_gateway TO sf_identity_queue_fixture WITH SET TRUE, INHERIT FALSE');
  issuerPool=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'sf_identity_issuer_fixture',password:'ci-identity-issuer-only'});
  queuePool=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'sf_identity_queue_fixture',password:'ci-identity-queue-only'});
  const step=createIdentityStepupHandler({auth,pool:issuerPool,origin,replayKey:randomBytes(32)});
  const list=createIdentityQueueHandler({auth,pool:queuePool,origin});
  const adminRequest=(path,body)=>new Request(origin+'/api/v2/admin/identity/'+path,{method:'POST',headers:{...headers(),'cf-connecting-ip':'192.0.2.62'},body:JSON.stringify(body)});
  const scope={subject,before:null};
  // No identity proof may be minted by an invalid code.
  const bad=String((Number(codeFromURI(uri))+1)%1000000).padStart(6,'0');
  const rejected=await step(adminRequest('stepup',{...scope,code:bad}));
  assert.equal(rejected.status,403,'identity verification rejects incorrect TOTP');
  const code=codeFromURI(uri);
  const issued=await step(adminRequest('stepup',{...scope,code}));
  assert.equal(issued.status,200,'real TOTP re-verification and restricted issuer');
  const {proof}=await issued.json();
  assert.match(proof,/^[0-9a-f-]{36}$/);
  assert.equal((await list(adminRequest('cases',{proof,subject:null,before:null}))).status,403,'proof cannot widen account filter');
  const page=await list(adminRequest('cases',{proof,...scope}));
  assert.equal(page.status,200);
  const results=await page.json();
  assert.equal(results.cases.length,1);assert.equal(results.cases[0].attemptId,attempt);assert.equal(results.cases[0].principalId,subject);
  assert.deepEqual(results.cases[0].evidenceKinds,[]);assert.equal(results.next,null);
  assert.equal((await list(adminRequest('cases',{proof,...scope}))).status,403,'proof is single-use');
  assert.equal((await step(adminRequest('stepup',{...scope,code}))).status,403,'TOTP authorization replay');
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM sf_core.staff_audit WHERE actor_id=$1 AND action IN ('identity_queue_stepup','identity_case_list')",[actor])).rows[0].n),2);
  assert.ok((await post('sign-out',{})).ok);jar.clear();
  assert.equal((await list(adminRequest('cases',{proof,...scope}))).status,401,'signed-out session denied');
 }finally{await Promise.allSettled([issuerPool,queuePool,pool].filter(Boolean).map(p=>p.end()));}
});
