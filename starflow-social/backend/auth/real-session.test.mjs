import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
import {createPreviewHandler,verifyPreviewDatabaseRoles} from './preview-runtime.mjs';
import {createBusinessHandler} from './business-api.mjs';
import {provisionFreshAccount} from './fresh-account.mjs';
import {createRegistrationAdmission} from './registration-admission.mjs';
import {authorizeUpgrade,syncHint} from '../services/realtime-policy.mjs';
const origin='https://integration-weizai.example.workers.dev';
const secret='synthetic-real-session-test-only-not-a-production-secret';
test('real Better Auth session -> restricted business SQL -> realtime policy; logout invalidates access',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});
 let pool,authPool,freshPool,issuerPool,fixtureRolesEnabled=false;
 let a,b;
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
  assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),true);
  // An unsafe permission change must prevent readiness even though both roles can connect.
  await owner.query('GRANT SELECT ON public."user" TO sf_business_connect');
  try{assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),false);}
  finally{await owner.query('REVOKE SELECT ON public."user" FROM sf_business_connect');}
  assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),true);
  // Rehearse a privilege drift in disposable CI only. Never grant these roles in staging.
  await owner.query('GRANT sf_didit_reconcile_gateway TO sf_business_connect WITH SET TRUE, INHERIT FALSE');
  try{assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),false);}
  finally{await owner.query('REVOKE sf_didit_reconcile_gateway FROM sf_business_connect');}
  assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),true);
  // Temporary direct EXECUTE grants in disposable CI only.
  for(const role of ['sf_auth_runtime','sf_business_connect','sf_profile_runtime','sf_session_gateway']){
   await owner.query('GRANT EXECUTE ON FUNCTION sf_core.issue_registration_admission(uuid,text) TO '+role);
   try{assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),false,'unsafe direct function grant '+role);}
   finally{await owner.query('REVOKE EXECUTE ON FUNCTION sf_core.issue_registration_admission(uuid,text) FROM '+role);}
  }
  assert.equal(await verifyPreviewDatabaseRoles(authPool,pool,db.database),true);
  // Actual isolated provisioning connection, with no inherited privileges: disposable CI only.
  await owner.query("CREATE ROLE sf_fresh_integration_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-local-fresh-fixture-only'");
  await owner.query('GRANT sf_fresh_account_gateway TO sf_fresh_integration_fixture WITH SET TRUE, INHERIT FALSE');
  freshPool=new pg.Pool({...db,user:'sf_fresh_integration_fixture',password:'synthetic-local-fresh-fixture-only'});
  await assert.rejects(freshPool.query('SELECT * FROM public."user" LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(freshPool.query('SELECT * FROM sf_core.staff_roles LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(pool.query('SET ROLE sf_fresh_account_gateway'),e=>e.code==='42501');
  await assert.rejects(authPool.query('SET ROLE sf_fresh_account_gateway'),e=>e.code==='42501');
  await owner.query("CREATE ROLE sf_registration_ci_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-local-admission-ci-only'");
  await owner.query('GRANT sf_registration_issuer TO sf_registration_ci_fixture WITH SET TRUE, INHERIT FALSE');
  issuerPool=new pg.Pool({...db,user:'sf_registration_ci_fixture',password:'synthetic-local-admission-ci-only'});
  const admissions=createRegistrationAdmission(issuerPool);
  await assert.rejects(issuerPool.query('SELECT * FROM public."user" LIMIT 0'),e=>e.code==='42501');
  const o=authOptions({database:authPool,origin,secret});
  const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false},
   emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({user,url})=>{assert.equal(await admissions.issueForNewSignup(user),true,'new signup admission');assert.equal(await admissions.allowRecipient({...user,purpose:'verify'}),true);pending.set(user.email,url);}}});
  // Exercise the same guarded dispatcher as the deployed Worker, using only the disposable CI service.
  const previewHost='ep-fixture.example.neon.tech';
  const previewEnv={STARFLOW_V2_ENABLED:'true',STARFLOW_V2_PREVIEW_ONLY:'true',STARFLOW_SOCIAL_PREVIEW_ENABLED:'true',STARFLOW_INBOX_PREVIEW_ENABLED:'true',STARFLOW_AUTH_ORIGIN:origin,STARFLOW_PREVIEW_DB_HOST:previewHost,BETTER_AUTH_SECRET:secret,
   STARFLOW_AUTH_DB_URL:'postgresql://sf_auth_runtime:synthetic-local-auth-fixture-only@'+previewHost+'/neondb?sslmode=require',
   STARFLOW_BUSINESS_DB_URL:'postgresql://sf_business_connect:synthetic-local-business-fixture-only@'+previewHost+'/neondb?sslmode=require'};
  const previewKey='c'.repeat(64);
  class FixturePool extends pg.Pool{
   constructor(config){
    assert.equal(config.host,previewHost);
    assert.ok(['sf_auth_runtime','sf_business_connect'].includes(config.user));
    super({...db,user:config.user,password:config.password});
   }
  }
  const guarded=createPreviewHandler({env:previewEnv,authorizePreview:async req=>req.headers.get('x-starflow-preview-key')===previewKey,Pool:FixturePool,attestationDatabase:db.database});
  const viaPreview=(method,path,cookie,data,key=previewKey,ip='192.0.2.33')=>guarded(new Request(origin+path,{method,headers:{origin,'content-type':'application/json','cf-connecting-ip':ip,'x-starflow-preview-key':key,...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}));
  const register=async(label,ip)=>{
   const email=label+'@example.invalid',password='synthetic-strong-password-'+label+'-2026';
   const headers={origin,'content-type':'application/json','cf-connecting-ip':ip};
   const post=(path,data,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:{...headers,...(cookie?{cookie}:{})},body:JSON.stringify(data)}));
   const signup=await post('sign-up/email',{email,password,name:label,username:label});
   assert.ok(signup.ok,'signup '+signup.status);
   const verify=pending.get(email);assert.ok(verify);
   const confirmed=await auth.handler(new Request(verify,{headers}));assert.ok(confirmed.ok||confirmed.status===302);
   const login=await viaPreview('POST','/api/identity/auth/sign-in/email',null,{email,password},previewKey,ip);assert.ok(login.ok,'login '+login.status);
   const cookie=login.headers.getSetCookie().find(v=>v.includes('session_token=')).split(';')[0];
   const session=await auth.api.getSession({headers:new Headers({cookie})});
   assert.equal(session.user.email,email);assert.equal(session.user.emailVerified,true);
   return {cookie,subject:session.user.id,logout:()=>post('sign-out',{},cookie)};
  };
  const alice=await register('integration_alice','192.0.2.31');
  const bob=await register('integration_bob','192.0.2.32');
  const initialize=account=>provisionFreshAccount({auth,pool:freshPool,headers:new Headers({cookie:account.cookie})});
  assert.equal((await viaPreview('GET','/api/v2/me',alice.cookie)).status,403);
  assert.equal(await admissions.allowRecipient({id:alice.subject,email:'integration_alice@example.invalid',purpose:'verify'}),false);
  // Admissions were committed by the separate issuer during the synthetic new-signup callback.
  const ar=await initialize(alice),br=await initialize(bob);
  assert.equal(ar.status,'created');assert.equal(br.status,'created');
  a=ar.principal;b=br.principal;
  assert.notEqual(a,b);assert.notEqual(a,alice.subject);assert.notEqual(b,bob.subject);
  assert.equal((await initialize(alice)).status,'not_permitted');
  const fresh=await owner.query('SELECT id,handle,bio,avatar_url FROM sf_core.profiles WHERE id IN ($1,$2) ORDER BY handle',[a,b]);
  assert.deepEqual(fresh.rows,[{id:a,handle:'integration_alice',bio:'',avatar_url:null},{id:b,handle:'integration_bob',bio:'',avatar_url:null}]);
  for(const table of ['staff_roles','identity_evidence_reviewers','account_recovery_policy']){
   assert.equal((await owner.query('SELECT count(*) AS n FROM sf_core.'+table+' WHERE principal_id IN ($1,$2)',[a,b])).rows[0].n,'0');
  }
  await owner.query('INSERT INTO sf_core.follows(follower_id,target_id,accepted) VALUES($1,$2,true),($2,$1,true)',[a,b]);
  assert.equal((await viaPreview('GET','/api/v2/me',alice.cookie,null,'wrong')).status,403);
  assert.equal((await viaPreview('GET','/api/v2/me',null)).status,401);
  assert.equal((await (await viaPreview('GET','/api/v2/me',alice.cookie)).json()).profile.id,a);
  const published=await viaPreview('POST','/api/v2/posts',alice.cookie,{content:'guarded integration fixture',visibility:'members'});
  assert.equal(published.status,201);const post=(await published.json()).post;
  assert.equal(post.author_id,a);
  assert.equal((await viaPreview('POST','/api/v2/posts/like',bob.cookie,{id:post.id,enabled:true})).status,200);
  const comment=await viaPreview('POST','/api/v2/comments',bob.cookie,{post:post.id,content:'guarded comment fixture'});
  assert.equal(comment.status,201);
  const comments=await viaPreview('GET','/api/v2/comments?post='+post.id,alice.cookie);
  assert.equal(comments.status,200);assert.ok((await comments.json()).comments.some(x=>x.author_id===b));
  assert.equal((await viaPreview('POST','/api/v2/admin/identity/cases',alice.cookie,{})).status,404);
  assert.equal((await viaPreview('POST','/api/identity/auth/passkey/verify-authentication',null,{})).status,404);
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
  assert.equal((await initialize(bob)).status,'not_permitted');
  assert.equal(await upgrade(),null);assert.equal(syncHint(grant,await upgrade()),null);
  assert.equal((await call('GET','/api/v2/notifications',bob.cookie)).status,401);
  assert.equal((await viaPreview('GET','/api/v2/posts',bob.cookie)).status,401);
 }finally{
  try{
   await Promise.allSettled([pool,authPool,freshPool,issuerPool].filter(Boolean).map(p=>p.end()));
   if(fixtureRolesEnabled){
    await owner.query("ALTER ROLE sf_auth_runtime NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_business_connect NOLOGIN PASSWORD NULL");
   }
  }finally{await owner.end();}
 }
});
