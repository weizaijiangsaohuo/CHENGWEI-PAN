import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
import {createBusinessHandler} from './business-api.mjs';
import {authorizeUpgrade,syncHint} from '../services/realtime-policy.mjs';
const origin='https://integration.example.invalid';
const secret='synthetic-real-session-test-only-not-a-production-secret';
test('real Better Auth session -> restricted business SQL -> realtime policy; logout invalidates access',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});
 let pool,authPool,fixtureRolesEnabled=false;
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const pending=new Map();
 try{
  // Only the disposable PostgreSQL service declared in starflow-auth-lab.yml.
  // Never run this role activation against Neon or a shared database.
  const identity=(await owner.query("SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS host")).rows[0];
  assert.equal(identity.db,'starflow_auth_test');assert.equal(identity.role,'postgres');
  assert.equal(db.host,'127.0.0.1');
  const roles=(await owner.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('sf_auth_runtime','sf_business_connect') ORDER BY rolname")).rows;
  assert.deepEqual(roles,[{rolname:'sf_auth_runtime',rolcanlogin:false},{rolname:'sf_business_connect',rolcanlogin:false}]);
  await owner.query("BEGIN");
  try{
   await owner.query("ALTER ROLE sf_auth_runtime LOGIN PASSWORD 'synthetic-local-auth-fixture-only'");
   await owner.query("ALTER ROLE sf_business_connect LOGIN PASSWORD 'synthetic-local-business-fixture-only'");
   await owner.query("COMMIT");fixtureRolesEnabled=true;
  }catch(error){await owner.query("ROLLBACK");throw error;}
  authPool=new pg.Pool({...db,user:'sf_auth_runtime',password:'synthetic-local-auth-fixture-only'});
  pool=new pg.Pool({...db,user:'sf_business_connect',password:'synthetic-local-business-fixture-only'});
  assert.equal((await authPool.query('SELECT current_user AS role')).rows[0].role,'sf_auth_runtime');
  assert.equal((await pool.query('SELECT current_user AS role')).rows[0].role,'sf_business_connect');
  await assert.rejects(authPool.query('SELECT id FROM sf_core.profiles LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(pool.query('SELECT id FROM public."user" LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(pool.query('SET ROLE sf_review_gateway'),e=>e.code==='42501');
  const o=authOptions({database:authPool,origin,secret});
  const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false},
   emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({user,url})=>{pending.set(user.email,url);}}});
  const register=async(label,ip)=>{
   const email=label+'@example.invalid',password='synthetic-strong-password-'+label+'-2026';
   const headers={origin,'content-type':'application/json','cf-connecting-ip':ip};
   const post=(path,data,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:{...headers,...(cookie?{cookie}:{})},body:JSON.stringify(data)}));
   const signup=await post('sign-up/email',{email,password,name:label,username:label});
   assert.ok(signup.ok,'signup '+signup.status);
   const verify=pending.get(email);assert.ok(verify);
   const confirmed=await auth.handler(new Request(verify,{headers}));assert.ok(confirmed.ok||confirmed.status===302);
   const login=await post('sign-in/email',{email,password});assert.ok(login.ok,'login '+login.status);
   const cookie=login.headers.getSetCookie().find(v=>v.includes('session_token=')).split(';')[0];
   const session=await auth.api.getSession({headers:new Headers({cookie})});
   assert.equal(session.user.email,email);assert.equal(session.user.emailVerified,true);
   return {cookie,subject:session.user.id,logout:()=>post('sign-out',{},cookie)};
  };
  const alice=await register('integration_alice','192.0.2.31');
  const bob=await register('integration_bob','192.0.2.32');
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1),($2)',[a,b]);
  await owner.query("INSERT INTO sf_core.profiles(id,handle) VALUES($1,'integration_a'),($2,'integration_b')",[a,b]);
  await owner.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2),($3,$4)',[a,alice.subject,b,bob.subject]);
  await owner.query('INSERT INTO sf_core.follows(follower_id,target_id,accepted) VALUES($1,$2,true),($2,$1,true)',[a,b]);
  const handle=createBusinessHandler({auth,pool,origin});
  const call=(method,path,cookie,data)=>handle(new Request(origin+path,{method,headers:{origin,cookie,'content-type':'application/json','x-user-id':b},...(data?{body:JSON.stringify(data)}:{})}));
  assert.equal((await (await call('GET','/api/v2/me',alice.cookie)).json()).profile.id,a);
  assert.equal((await (await call('GET','/api/v2/me',bob.cookie)).json()).profile.id,b);
  assert.equal((await call('GET','/api/v2/me','bogus=1')).status,401);
  assert.equal((await call('POST','/api/v2/messages',alice.cookie,{recipient:b,body:'real session fixture'})).status,201);
  const inbox=await (await call('GET','/api/v2/notifications',bob.cookie)).json();
  assert.equal(inbox.notifications.length,1);
  assert.equal((await call('POST','/api/v2/notifications/read',alice.cookie,{id:inbox.notifications[0].id})).status,404);
  assert.equal((await call('POST','/api/v2/notifications/read',bob.cookie,{id:inbox.notifications[0].id})).status,200);
  // Trusted mapping uses restricted role; no caller-supplied actor.
  const resolvePrincipal=async subject=>{
   const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE sf_session_gateway');
    const result=await c.query('SELECT sf_core.resolve_auth_subject($1::uuid) AS id',[subject]);await c.query('COMMIT');return result.rows[0]?.id;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  };
  const upgrade=()=>authorizeUpgrade({request:new Request(origin+'/api/realtime',{headers:{origin,upgrade:'websocket',cookie:bob.cookie}}),origin,auth,resolvePrincipal});
  const grant=await upgrade();assert.equal(grant?.principal,b);
  assert.equal(syncHint(grant,await upgrade()),'{"type":"sync_available"}');
  assert.ok((await bob.logout()).ok);
  assert.equal(await upgrade(),null);assert.equal(syncHint(grant,await upgrade()),null);
  assert.equal((await call('GET','/api/v2/notifications',bob.cookie)).status,401);
 }finally{
  try{
   await Promise.allSettled([pool,authPool].filter(Boolean).map(p=>p.end()));
   if(fixtureRolesEnabled){
    await owner.query("ALTER ROLE sf_auth_runtime NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_business_connect NOLOGIN PASSWORD NULL");
   }
  }finally{await owner.end();}
 }
});
