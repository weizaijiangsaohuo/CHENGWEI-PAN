import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createConfiguredPreviewVerifier} from './preview-access.mjs';
import {authOptions} from './auth.mjs';
import {createPreviewHandler,verifyPreviewDatabaseRoles} from './preview-runtime.mjs';
import {createBusinessHandler} from './business-api.mjs';
import {provisionFreshAccount} from './fresh-account.mjs';
import {createRegistrationAdmission} from './registration-admission.mjs';
import {createFreshRegistrationMail} from './auth-mail.mjs';
import {createFreshSignupHandler} from './fresh-signup-handler.mjs';
import {authorizeUpgrade,syncHint} from '../services/realtime-policy.mjs';
const origin='https://integration-weizai.example.workers.dev';
const secret='synthetic-real-session-test-only-not-a-production-secret';
test('real Better Auth session -> restricted business SQL -> realtime policy; logout invalidates access',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});
 let pool,authPool,freshPool,issuerPool,mailPool,fixtureRolesEnabled=false;
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
  assert.equal((await owner.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',['sf_fresh_account_connect'])).rows[0].rolcanlogin,false);
  await owner.query("ALTER ROLE sf_fresh_account_connect LOGIN PASSWORD 'synthetic-local-fresh-fixture-only'");
  freshPool=new pg.Pool({...db,user:'sf_fresh_account_connect',password:'synthetic-local-fresh-fixture-only'});
  await assert.rejects(freshPool.query('SELECT * FROM public."user" LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(freshPool.query('SELECT * FROM sf_core.staff_roles LIMIT 0'),e=>e.code==='42501');
  await assert.rejects(pool.query('SET ROLE sf_fresh_account_gateway'),e=>e.code==='42501');
  await assert.rejects(authPool.query('SET ROLE sf_fresh_account_gateway'),e=>e.code==='42501');
  assert.equal((await owner.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',['sf_registration_connect'])).rows[0].rolcanlogin,false);
  await owner.query("ALTER ROLE sf_registration_connect LOGIN PASSWORD 'synthetic-local-admission-ci-only'");
  issuerPool=new pg.Pool({...db,user:'sf_registration_connect',password:'synthetic-local-admission-ci-only'});
  const admissions=createRegistrationAdmission(issuerPool);
  await assert.rejects(issuerPool.query('SELECT * FROM public."user" LIMIT 0'),e=>e.code==='42501');
  // Exercise the real fresh-registration mail composition with a separate budget login.
  // Only the provider responses are synthetic; no network or paid calls.
  assert.equal((await owner.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',['sf_mail_budget_connect'])).rows[0].rolcanlogin,false);
  await owner.query("ALTER ROLE sf_mail_budget_connect LOGIN PASSWORD 'synthetic-mail-fixture-only'");
  mailPool=new pg.Pool({...db,user:'sf_mail_budget_connect',password:'synthetic-mail-fixture-only'});
  await assert.rejects(mailPool.query('SELECT * FROM public."user" LIMIT 0'),e=>e.code==='42501');
  const deliveries=[];
  const registrationMail={apiKey:'synthetic',sender:'security@example.invalid',recipientSecret:'independent-registration-mail-synthetic-secret',
   verifyBilling:async()=>true,transport:async(url,options)=>{
    if(url==='https://api.brevo.com/v3/account'){
     assert.equal(options.method,'GET');
     return Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:100}]});
    }
    assert.equal(url,'https://api.brevo.com/v3/smtp/email');
    const message=JSON.parse(options.body),recipient=message.to[0].email;
    const budget=await owner.query('SELECT purpose FROM sf_core.otp_mail_attempts WHERE event_id=$1',[message.headers.IdempotencyKey]);
    assert.equal(budget.rowCount,1);assert.equal(budget.rows[0].purpose,'verify');
    const link=message.textContent.split('\n')[1];
    assert.equal(new URL(link).origin,origin);assert.equal(new URL(link).pathname,'/api/identity/auth/verify-email');
    deliveries.push(recipient);pending.set(recipient,link);
    return Response.json({messageId:'synthetic'},{status:201});
   }};
  const mail=createFreshRegistrationMail({...registrationMail,enabled:true,pool:mailPool,origin,allowRecipient:admissions.allowRecipient});
  const auth=betterAuth(authOptions({database:authPool,origin,secret}));
  const registration=createFreshSignupHandler({enabled:true,database:authPool,origin,secret,admissions,mail,authorizePreview:async request=>request.headers.get('x-starflow-preview-key')==='c'.repeat(64)});
  assert.equal((await registration(new Request(origin+'/api/identity/auth/sign-up/email',{method:'POST',headers:{origin}}))).status,403);
  assert.equal((await registration(new Request(origin+'/api/identity/auth/request-password-reset',{method:'POST',headers:{origin,'x-starflow-preview-key':'c'.repeat(64)}}))).status,404);
  assert.equal((await registration(new Request(origin+'/api/identity/auth/verify-email?token=fixture&callbackURL=https://example.invalid',{headers:{'x-starflow-preview-key':'c'.repeat(64)}}))).status,400);
  // Exercise the same guarded dispatcher as the deployed Worker, using only the disposable CI service.
  const previewHost='ep-fixture.example.neon.tech';
  const previewEnv={STARFLOW_V2_ENABLED:'true',STARFLOW_V2_PREVIEW_ONLY:'true',STARFLOW_SOCIAL_PREVIEW_ENABLED:'true',STARFLOW_INBOX_PREVIEW_ENABLED:'true',STARFLOW_FRESH_PREVIEW_ENABLED:'true',STARFLOW_REGISTRATION_PREVIEW_ENABLED:'true',STARFLOW_AUTH_ORIGIN:origin,STARFLOW_PREVIEW_DB_HOST:previewHost,BETTER_AUTH_SECRET:secret,
   STARFLOW_AUTH_DB_URL:'postgresql://sf_auth_runtime:synthetic-local-auth-fixture-only@'+previewHost+'/neondb?sslmode=require',
   STARFLOW_BUSINESS_DB_URL:'postgresql://sf_business_connect:synthetic-local-business-fixture-only@'+previewHost+'/neondb?sslmode=require',
   STARFLOW_FRESH_DB_URL:'postgresql://sf_fresh_account_connect:synthetic-local-fresh-fixture-only@'+previewHost+'/neondb?sslmode=require',
   STARFLOW_REGISTRATION_DB_URL:'postgresql://sf_registration_connect:synthetic-local-admission-ci-only@'+previewHost+'/neondb?sslmode=require',
   STARFLOW_MAIL_DB_URL:'postgresql://sf_mail_budget_connect:synthetic-mail-fixture-only@'+previewHost+'/neondb?sslmode=require'};
  const previewKey='c'.repeat(64);
  class FixturePool extends pg.Pool{
   constructor(config){
    assert.equal(config.host,previewHost);
    assert.ok(['sf_auth_runtime','sf_business_connect','sf_fresh_account_connect','sf_registration_connect','sf_mail_budget_connect'].includes(config.user));
    super({...db,user:config.user,password:config.password});
   }
  }
  const guarded=createPreviewHandler({env:previewEnv,authorizePreview:async req=>req.headers.get('x-starflow-preview-key')===previewKey,Pool:FixturePool,attestationDatabase:db.database,registrationMail});
  const disabledReadiness=createPreviewHandler({env:{...previewEnv,STARFLOW_V2_ENABLED:'false',STARFLOW_REGISTRATION_PREVIEW_ENABLED:'false'},authorizePreview:async()=>true,Pool:FixturePool,attestationDatabase:db.database});
  const registrationReadiness=()=>disabledReadiness(new Request(origin+'/api/v2/registration-readiness'));
  const ready=await registrationReadiness();assert.equal(ready.status,200);
  assert.deepEqual(await ready.json(),{databaseReady:true,mailAdapterConfigured:false,liveMailVerified:false,registrationEnabled:false});
  await owner.query('GRANT SELECT ON public."user" TO sf_mail_budget_gateway');
  try{const denied=await registrationReadiness();assert.equal(denied.status,503);assert.deepEqual(await denied.json(),{databaseReady:false,stage:'mail_permissions'});}
  finally{await owner.query('REVOKE SELECT ON public."user" FROM sf_mail_budget_gateway');}
  const viaPreview=(method,path,cookie,data,key=previewKey,ip='192.0.2.33')=>guarded(new Request(origin+path,{method,headers:{origin,'content-type':'application/json','cf-connecting-ip':ip,'x-starflow-preview-key':key,...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}));
  const register=async(label,ip)=>{
   const email=label+'@example.invalid',password='synthetic-strong-password-'+label+'-2026';
   const headers={origin,'content-type':'application/json','cf-connecting-ip':ip};
   const post=(path,data,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:{...headers,...(cookie?{cookie}:{})},body:JSON.stringify(data)}));
   const signup=await guarded(new Request(origin+'/api/identity/auth/sign-up/email',{method:'POST',headers:{...headers,'x-starflow-preview-key':previewKey},body:JSON.stringify({email,password,name:label,username:label})}));
   assert.ok(signup.ok,'signup '+signup.status);
   const verify=pending.get(email);assert.ok(verify);
   const confirmed=await guarded(new Request(verify,{headers:{...headers,'x-starflow-preview-key':previewKey}}));assert.ok(confirmed.ok||confirmed.status===302);
   const login=await viaPreview('POST','/api/identity/auth/sign-in/email',null,{email,password},previewKey,ip);assert.ok(login.ok,'login '+login.status);
   const cookie=login.headers.getSetCookie().find(v=>v.includes('session_token=')).split(';')[0];
   const session=await auth.api.getSession({headers:new Headers({cookie})});
   assert.equal(session.user.email,email);assert.equal(session.user.emailVerified,true);
   return {cookie,subject:session.user.id,logout:()=>post('sign-out',{},cookie)};
  };
  const signupProbe=new Request(origin+'/api/identity/auth/sign-up/email',{method:'POST',headers:{origin,'x-starflow-preview-key':previewKey}});
  const noMail=createPreviewHandler({env:previewEnv,authorizePreview:async()=>true,Pool:FixturePool,attestationDatabase:db.database});
  assert.equal((await noMail(signupProbe)).status,503);
  await owner.query('GRANT SELECT ON public."user" TO sf_registration_issuer');
  try{assert.equal((await guarded(signupProbe)).status,503);}
  finally{await owner.query('REVOKE SELECT ON public."user" FROM sf_registration_issuer');}
  const alice=await register('integration_alice','192.0.2.31');
  const bob=await register('integration_bob','192.0.2.32');
  assert.deepEqual(deliveries,['integration_alice@example.invalid','integration_bob@example.invalid']);
  const initialize=async account=>(await viaPreview('POST','/api/v2/account/initialize',account.cookie)).json();
  assert.equal((await viaPreview('POST','/api/v2/account/initialize',alice.cookie,{subject:alice.subject})).status,400);
  assert.equal((await viaPreview('POST','/api/v2/account/initialize',alice.cookie,null,'wrong')).status,403);
  assert.equal((await viaPreview('POST','/api/v2/account/initialize',null)).status,403);
  await owner.query('GRANT SELECT ON public."user" TO sf_fresh_account_gateway');
  try{assert.equal((await viaPreview('POST','/api/v2/account/initialize',alice.cookie)).status,503);}
  finally{await owner.query('REVOKE SELECT ON public."user" FROM sf_fresh_account_gateway');}
  assert.equal((await viaPreview('GET','/api/v2/me',alice.cookie)).status,403);
  assert.equal(await admissions.allowRecipient({id:alice.subject,email:'integration_alice@example.invalid',purpose:'verify'}),false);
  // Admissions were committed by the separate issuer during the synthetic new-signup callback.
  const ar=await initialize(alice),br=await initialize(bob);
  assert.equal(ar.status,'created');assert.equal(br.status,'created');
  a=ar.principal;b=br.principal;
  assert.notEqual(a,b);assert.notEqual(a,alice.subject);assert.notEqual(b,bob.subject);
  // 030: a lost initialization response must not lock out a fresh account.
  const retried=await Promise.all([initialize(alice),initialize(alice)]);
  for(const result of retried)assert.deepEqual(result,{status:'created',principal:a});
  assert.equal((await owner.query('SELECT count(*) AS n FROM sf_core.auth_bindings WHERE auth_subject=$1',[alice.subject])).rows[0].n,'1');
  assert.equal((await (await viaPreview('GET','/api/v2/me',alice.cookie)).json()).profile.id,a);
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
  // Real signature verification plus real restricted database session in one request.
  // The local signing key is synthetic and never used with Cloudflare or Neon.
  const issuer='https://starflow-fixture.cloudflareaccess.com',aud='a'.repeat(64),email='owner@example.invalid';
  const signedEnv={...previewEnv,STARFLOW_ACCESS_ISSUER:issuer,STARFLOW_ACCESS_AUD:aud,STARFLOW_ACCESS_OWNER_EMAIL:email};
  const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
  const jwk=await exportJWK(publicKey);jwk.kid='fixture';jwk.alg='RS256';
  const token=async(overrides={})=>new SignJWT({iss:issuer,aud:[aud],sub:'synthetic-owner',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,type:'app',email,...overrides}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign(privateKey);
  const verifier=createConfiguredPreviewVerifier(signedEnv,{keyset:createLocalJWKSet({keys:[jwk]})});
  const signedHandler=createPreviewHandler({env:signedEnv,authorizePreview:verifier,Pool:FixturePool,attestationDatabase:db.database});
  const signedInbox=(jwt,cookie)=>signedHandler(new Request(origin+'/api/v2/inbox-preview',{headers:{...(jwt?{'cf-access-jwt-assertion':jwt}:{}),...(cookie?{cookie}:{}),'cf-access-authenticated-user-email':email}}));
  const validJWT=await token();
  assert.equal((await signedInbox(null,bob.cookie)).status,403);
  assert.equal((await signedInbox(await token({aud:['b'.repeat(64)]}),bob.cookie)).status,403);
  assert.equal((await signedInbox(validJWT,null)).status,401);
  const page=await signedInbox(validJWT,bob.cookie);
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/text\/html/);
  assert.match(page.headers.get('cache-control'),/no-store/);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const html=await page.text();
  assert.ok(html.includes('消息：1')&&html.includes('通知：1'));
  for(const privateValue of ['real session fixture',a,b,bob.subject,bob.cookie,validJWT])assert.ok(!html.includes(privateValue));
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
  assert.equal((await signedInbox(validJWT,bob.cookie)).status,401);
  assert.equal((await initialize(bob)).status,'not_permitted');
  assert.equal(await upgrade(),null);assert.equal(syncHint(grant,await upgrade()),null);
  assert.equal((await call('GET','/api/v2/notifications',bob.cookie)).status,401);
  assert.equal((await viaPreview('GET','/api/v2/posts',bob.cookie)).status,401);
 }finally{
  try{
   await Promise.allSettled([pool,authPool,freshPool,issuerPool,mailPool].filter(Boolean).map(p=>p.end()));
   if(fixtureRolesEnabled){
    await owner.query("ALTER ROLE sf_auth_runtime NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_business_connect NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_fresh_account_connect NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_registration_connect NOLOGIN PASSWORD NULL");
    await owner.query("ALTER ROLE sf_mail_budget_connect NOLOGIN PASSWORD NULL");
   }
  }finally{await owner.end();}
 }
});
