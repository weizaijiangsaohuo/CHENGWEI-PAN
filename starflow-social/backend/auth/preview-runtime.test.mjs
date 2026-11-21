import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewHandler,restrictedPoolConfig} from './preview-runtime.mjs';
import {createConfiguredPreviewVerifier} from './preview-access.mjs';
const origin='https://preview-weizai.example.workers.dev',host='ep-fixture.c-1.ap-southeast-1.aws.neon.tech';
const url=(role,pwd)=>'postgresql://'+role+':'+pwd+'@'+host+'/neondb?sslmode=require&channel_binding=require';
const env={STARFLOW_V2_ENABLED:'true',STARFLOW_V2_PREVIEW_ONLY:'true',STARFLOW_AUTH_ORIGIN:origin,STARFLOW_PREVIEW_DB_HOST:host,
 STARFLOW_AUTH_DB_URL:url('sf_auth_runtime','synthetic-auth-only'),STARFLOW_BUSINESS_DB_URL:url('sf_business_connect','synthetic-business-only'),
 BETTER_AUTH_SECRET:'synthetic-preview-test-only-not-real-secret'};
const req=(path,extra={})=>new Request(origin+path,extra);
test('strict Neon target and role, verified TLS, no owner or pooled connection',()=>{
 const cfg=restrictedPoolConfig(env.STARFLOW_AUTH_DB_URL,'sf_auth_runtime',host);
 assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.user,'sf_auth_runtime');assert.equal(cfg.max,1);
 for(const bad of [url('neondb_owner','fixture'),env.STARFLOW_AUTH_DB_URL.replace(host,'wrong.example.invalid'),env.STARFLOW_AUTH_DB_URL.replace('sslmode=require','sslmode=disable'),env.STARFLOW_AUTH_DB_URL+'&host=evil',env.STARFLOW_AUTH_DB_URL.replace(host,host.replace('ep-fixture','ep-fixture-pooler'))])assert.throws(()=>restrictedPoolConfig(bad,'sf_auth_runtime',host));
});
test('preview guard denies production, unauthorized, signup, review, passkey, realtime without socket creation',async()=>{
 let n=0;class Pool{constructor(){n++;throw Error('must not connect');}}
 const create=(cfg,authz)=>createPreviewHandler({env:cfg,authorizePreview:authz,Pool});
 assert.equal((await create({...env,STARFLOW_V2_ENABLED:'false'},async()=>true)(req('/api/v2/me'))).status,404);
 assert.equal((await create(env,undefined)(req('/api/v2/me'))).status,404);
 assert.equal((await create(env,async()=>false)(req('/api/v2/me'))).status,403);
 assert.equal((await create(env,async()=>true)(new Request('https://weizai.example.workers.dev/api/v2/me'))).status,404);
 const h=create(env,async()=>true);
 for(const path of ['/api/identity/auth/sign-up/email','/api/identity/auth/passkey/verify-authentication','/api/v2/admin/reports/review','/api/realtime','/api/identity/auth/email-otp/send-verification-otp'])assert.equal((await h(req(path,{method:'POST',headers:{origin}}))).status,404);
 assert.equal((await h(req('/api/v2/messages',{method:'POST',headers:{origin:'https://evil.invalid'}}))).status,403);
 assert.equal((await h(req('/api/identity/auth/two-factor/verify-totp',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({code:'123456',trustDevice:true})}))).status,400);
 assert.equal(n,0);
});
test('real request dispatcher separates pools, preserves session cookie and closes on success and failure',async()=>{
 const instances=[];class Pool{constructor(cfg){this.cfg=cfg;this.closed=false;instances.push(this);}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){this.closed=true;}}
 let authCalls=0;const authFactory=({database})=>{assert.equal(database.cfg.user,'sf_auth_runtime');return {handler:async()=>{authCalls++;return Response.json({ok:true},{headers:{'Set-Cookie':'fixture=1; Secure; HttpOnly'}});},api:{getSession:async()=>null}};};
 const h=createPreviewHandler({env,authorizePreview:async()=>true,Pool,authFactory});
 const r=await h(req('/api/identity/auth/get-session'));assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal((await h(req('/api/v2/me'))).status,401);assert.equal(authCalls,1);assert.deepEqual(instances.map(p=>p.cfg.user),['sf_auth_runtime','sf_auth_runtime','sf_business_connect']);assert.ok(instances.every(p=>p.closed));
 const fail=createPreviewHandler({env,authorizePreview:async()=>true,Pool,authFactory:()=>{throw Error('fixture');}});
 assert.equal((await fail(req('/api/v2/me'))).status,503);assert.ok(instances.every(p=>p.closed));
});

test('owner-only readiness checks both pool identities without exposing credentials',async()=>{
 const pools=[];
 class Pool{
  constructor(cfg){this.cfg=cfg;this.closed=false;this.queries=[];pools.push(this);}
  async query(sql){this.queries.push(sql);return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}
  async end(){this.closed=true;}
 }
 const make=(authorizePreview,options={})=>createPreviewHandler({env,authorizePreview,Pool,authFactory:()=>{throw Error('must not invoke auth handler');},...options});
 assert.equal((await make(async()=>false)(req('/api/v2/readiness'))).status,403);
 assert.equal((await make(async()=>true)(new Request('https://weizai.example.workers.dev/api/v2/readiness'))).status,404);
 assert.equal(pools.length,0);
 const result=await make(async()=>true)(req('/api/v2/readiness'));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{ready:true});
 assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(pools.map(p=>p.cfg.user),['sf_auth_runtime','sf_business_connect']);
 assert.ok(pools.every(p=>p.closed&&p.queries.length===2));
 class WrongPool extends Pool{async query(){return {rows:[{role:'neondb_owner',login:'neondb_owner',db:'neondb'}]};}}
 const wrong=await make(async()=>true,{Pool:WrongPool})(req('/api/v2/readiness'));
 assert.equal(wrong.status,503);assert.deepEqual(await wrong.json(),{error:'unavailable'});
 class ExcessPrivilegesPool extends Pool{async query(sql){if(sql.includes('session_user'))return super.query(sql);return {rows:[{safe:false}]};}}
 const excess=await make(async()=>true,{Pool:ExcessPrivilegesPool})(req('/api/v2/readiness'));
 assert.equal(excess.status,503);assert.deepEqual(await excess.json(),{error:'unavailable'});
 class UnrestrictedPool extends Pool{async query(){return {rows:[{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:false}]};}}
 assert.equal((await make(async()=>true,{Pool:UnrestrictedPool})(req('/api/v2/readiness'))).status,503);
 class OfflinePool extends Pool{async query(){throw Error('synthetic private connection error');}}
 const offline=await make(async()=>true,{Pool:OfflinePool})(req('/api/v2/readiness'));
 assert.equal(offline.status,503);assert.deepEqual(await offline.json(),{error:'unavailable'});
 assert.ok(pools.every(p=>p.closed));
});

test('owner-key mode preserves disabled and production guards; forwards no owner key',async()=>{
 const key='c'.repeat(64),cfg={...env,STARFLOW_PREVIEW_OWNER_KEY:key};
 let pools=0,calls=0;
 class Pool{constructor(cfg){pools++;this.cfg=cfg;}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){}}
 const make=(bindings)=>createPreviewHandler({env:bindings,authorizePreview:createConfiguredPreviewVerifier(bindings),Pool,authFactory:()=>({handler:async request=>{calls++;assert.equal(request.headers.get('x-starflow-preview-key'),null);assert.equal(request.headers.get('origin'),origin);assert.deepEqual(await request.json(),{email:'fixture@example.invalid',password:'fixture-only'});return Response.json({ok:true});}})});
 const path='/api/identity/auth/sign-in/email';
 const input={method:'POST',headers:{origin,'content-type':'application/json','x-starflow-preview-key':key},body:JSON.stringify({email:'fixture@example.invalid',password:'fixture-only'})};
 assert.equal((await make({...cfg,STARFLOW_V2_ENABLED:'false'})(req(path,input))).status,404);
 assert.equal((await make(cfg)(new Request('https://weizai.example.workers.dev'+path,input))).status,404);
 assert.equal((await make(cfg)(req(path,{...input,headers:{...input.headers,'x-starflow-preview-key':'d'.repeat(64)}}))).status,403);
 assert.equal(pools,0);
 assert.equal((await make(cfg)(req(path,input))).status,200);assert.equal(pools,1);assert.equal(calls,1);
});

test('new social preview routes require explicit flag plus owner access',async()=>{
 let pools=0;class Pool{constructor(cfg){pools++;this.cfg=cfg;}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){}}
 const make=(bindings,authorizePreview)=>createPreviewHandler({env:bindings,authorizePreview,Pool,authFactory:()=>({api:{getSession:async()=>null}})});
 assert.equal((await make(env,async()=>true)(req('/api/v2/posts'))).status,404);
 const enabled={...env,STARFLOW_SOCIAL_PREVIEW_ENABLED:'true'};
 assert.equal((await make(enabled,async()=>false)(req('/api/v2/posts'))).status,403);assert.equal(pools,0);
 assert.equal((await make(enabled,async()=>true)(req('/api/v2/posts'))).status,401);assert.equal(pools,2);
});

test('owner-only readiness works with business explicitly disabled, never on production',async()=>{
 const pools=[];class Pool{constructor(cfg){this.cfg=cfg;pools.push(this);}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){this.closed=true;}}
 let authCalls=0;
 const make=(cfg,verify=async()=>true)=>createPreviewHandler({env:cfg,authorizePreview:verify,Pool,authFactory:()=>{authCalls++;throw Error('must not instantiate auth');}});
 const off={...env,STARFLOW_V2_ENABLED:'false',STARFLOW_SOCIAL_PREVIEW_ENABLED:'true'};
 assert.equal((await make(off,async()=>false)(req('/api/v2/readiness'))).status,403);
 assert.equal((await make(off)(req('/api/v2/readiness?x=1'))).status,400);
 assert.equal((await make(off)(new Request('https://weizai.example.workers.dev/api/v2/readiness'))).status,404);
 assert.equal((await make({...off,STARFLOW_V2_PREVIEW_ONLY:'false'})(req('/api/v2/readiness'))).status,404);
 assert.equal((await make({...off,STARFLOW_V2_ENABLED:undefined})(req('/api/v2/readiness'))).status,404);
 for(const path of ['/api/v2/posts','/api/v2/me','/api/identity/auth/get-session'])assert.equal((await make(off)(req(path))).status,404);
 assert.equal(pools.length,0);
 const ready=await make(off)(req('/api/v2/readiness'));assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{ready:true});
 assert.equal(pools.length,2);assert.ok(pools.every(p=>p.closed));assert.equal(authCalls,0);
});

test('readiness failure classification is fixed, owner-gated and preserves disabled service',async()=>{
 const off={...env,STARFLOW_V2_ENABLED:'false'};
 class Pool{constructor(cfg){this.cfg=cfg;}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){}}
 const run=(cfg,PoolClass=Pool,allowed=true)=>createPreviewHandler({env:cfg,authorizePreview:async()=>allowed,Pool:PoolClass})(req('/api/v2/readiness'));
 const check=async(p,stage)=>{const r=await p;assert.equal(r.status,503);assert.equal(r.headers.get('X-Starflow-Readiness-Stage'),stage);assert.deepEqual(await r.json(),{error:'unavailable'});};
 await check(run({...off,STARFLOW_BUSINESS_DB_URL:undefined}),'business_missing');
 await check(run({...off,STARFLOW_AUTH_DB_URL:undefined}),'auth_missing');
 await check(run({...off,STARFLOW_BUSINESS_DB_URL:'bad'}),'business_config');
 class BadPassword extends Pool{async query(sql){if(this.cfg.user==='sf_business_connect')throw Object.assign(Error('private password fixture'),{code:'28P01'});return super.query(sql);}}
 await check(run(off,BadPassword),'business_credentials');
 class BadRole extends Pool{async query(sql){if(this.cfg.user==='sf_auth_runtime')return {rows:[]};return super.query(sql);}}
 await check(run(off,BadRole),'auth_role');
 const denied=await run({...off,STARFLOW_BUSINESS_DB_URL:undefined},Pool,false);assert.equal(denied.status,403);assert.equal(denied.headers.get('X-Starflow-Readiness-Stage'),null);
});

test('preview authentication rejects extra fields, invalid factors and reset bypass before database access',async()=>{
 let pools=0;class Pool{constructor(){pools++;throw Error('unexpected database');}}
 const h=createPreviewHandler({env,authorizePreview:async()=>true,Pool});
 const call=(path,data)=>h(req('/api/identity/auth/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}));
 for(const data of [{code:'123456',trustDevice:'true'},{code:123456},{code:'12345'},{code:'123456',userId:'fixture'},{code:'123456',rememberMe:true}])assert.equal((await call('two-factor/verify-totp',data)).status,400);
 for(const data of [{email:'fixture@example.invalid',password:'fixture',callbackURL:'https://other.invalid'},{email:'fixture@example.invalid',password:'fixture',rememberMe:1},{email:'fixture@example.invalid',password:'fixture',rememberMe:true},{email:['fixture@example.invalid'],password:'fixture'}])assert.equal((await call('sign-in/email',data)).status,400);
 for(const path of ['request-password-reset','reset-password','two-factor/disable','two-factor/verify-backup-code','passkey/verify-authentication'])assert.equal((await call(path,{})).status,404);
 assert.equal(pools,0);
});

test('enabled preview operations recheck role privileges and fail before auth or business dispatch',async()=>{
 let calls=0;const pools=[];
 class Pool{
  constructor(cfg){this.cfg=cfg;pools.push(this);}
  async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:this.cfg.user!=='sf_business_connect'}]};}
  async end(){this.closed=true;}
 }
 const h=createPreviewHandler({env,authorizePreview:async()=>true,Pool,authFactory:()=>{calls++;return {handler:async()=>Response.json({ok:true})};}});
 assert.equal((await h(req('/api/identity/auth/get-session'))).status,200);
 assert.equal(pools.length,1);assert.equal(calls,1);
 const denied=await h(req('/api/v2/me'));assert.equal(denied.status,503);
 assert.deepEqual(await denied.json(),{error:'unavailable'});assert.equal(calls,1);
 assert.ok(pools.every(p=>p.closed));
 class UnsafeAuth extends Pool{async query(){return {rows:[{role:'neondb_owner',login:'neondb_owner',db:'neondb',restricted:false}]};}}
 const unsafe=createPreviewHandler({env,authorizePreview:async()=>true,Pool:UnsafeAuth,authFactory:()=>{calls++;throw Error('unexpected dispatch');}});
 assert.equal((await unsafe(req('/api/identity/auth/get-session'))).status,503);
 assert.equal(calls,1);
});

test('isolated inbox HTML preview is opt-in, does not accept owner-key mode, and denies before opening pools',async()=>{
 let opened=0;class Pool{constructor(){opened++;throw Error('unexpected pool');}}
 const run=(cfg,authorizePreview=async()=>true,path='/api/v2/inbox-preview')=>createPreviewHandler({env:cfg,authorizePreview,Pool})(req(path));
 assert.equal((await run(env)).status,404);
 const enabled={...env,STARFLOW_INBOX_PREVIEW_ENABLED:'true'};
 assert.equal((await run({...enabled,STARFLOW_V2_ENABLED:'false'})).status,404);
 assert.equal((await run({...enabled,STARFLOW_PREVIEW_OWNER_KEY:'c'.repeat(64)})).status,404);
 assert.equal((await run(enabled,async()=>false)).status,403);
 assert.equal((await run(enabled,async()=>true,'/api/v2/inbox-preview?principal=arbitrary')).status,400);
 assert.equal(opened,0);
});

test('registration readiness is owner-only, read-only, and keeps signup disabled',async()=>{
 const pools=[];class Pool{constructor(cfg){this.cfg=cfg;pools.push(this);}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){this.closed=true;}}
 const cfg={...env,STARFLOW_V2_ENABLED:'false',STARFLOW_FRESH_DB_URL:url('sf_fresh_account_connect','fresh-only'),STARFLOW_REGISTRATION_DB_URL:url('sf_registration_connect','issuer-only'),STARFLOW_MAIL_DB_URL:url('sf_mail_budget_connect','mail-only')};
 const make=(bindings,allowed=true)=>createPreviewHandler({env:bindings,authorizePreview:async()=>allowed,Pool,authFactory:()=>{throw Error('never create auth');},registrationMail:{verifyBilling:()=>{throw Error('never call billing');},transport:()=>{throw Error('never call provider');}}});
 const path='/api/v2/registration-readiness';
 const denied=await make(cfg,false)(req(path));assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{error:'not_permitted'});
 assert.equal((await make(cfg)(req(path+'?debug=1'))).status,400);
 assert.equal((await make(cfg)(new Request('https://weizai.example.workers.dev'+path))).status,404);
 assert.equal(pools.length,0);
 const missing=await make({...cfg,STARFLOW_MAIL_DB_URL:undefined})(req(path));assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{databaseReady:false,stage:'mail_missing'});
 const result=await make(cfg)(req(path));assert.equal(result.status,200);assert.deepEqual(await result.json(),{databaseReady:true,mailAdapterConfigured:true,liveMailVerified:false,registrationEnabled:false});
 assert.ok(pools.every(p=>p.closed));
 assert.equal((await make(cfg)(req('/api/identity/auth/sign-up/email',{method:'POST',headers:{origin}}))).status,404);
});

test('signup cannot start unless browser access and independent account initialization are enabled',async()=>{
 let opened=0;class Pool{constructor(){opened++;throw Error('no pool expected');}}
 const cfg={...env,STARFLOW_REGISTRATION_PREVIEW_ENABLED:'true'};
 const run=(bindings,path,method)=>createPreviewHandler({env:bindings,authorizePreview:async()=>true,Pool})(req(path,{method,headers:{origin}}));
 for(const [path,method] of [['/api/identity/auth/sign-up/email','POST'],['/api/identity/auth/verify-email?token=fixture','GET']]){
  assert.equal((await run(cfg,path,method)).status,404);
  assert.equal((await run({...cfg,STARFLOW_FRESH_PREVIEW_ENABLED:'true',STARFLOW_PREVIEW_OWNER_KEY:'c'.repeat(64)},path,method)).status,404);
 }
 assert.equal(opened,0);
});
test('registration fails before signup when business or provisioning privileges are unsafe',async()=>{
 const cfg={...env,STARFLOW_REGISTRATION_PREVIEW_ENABLED:'true',STARFLOW_FRESH_PREVIEW_ENABLED:'true',
 STARFLOW_FRESH_DB_URL:url('sf_fresh_account_connect','fresh-only'),STARFLOW_REGISTRATION_DB_URL:url('sf_registration_connect','issuer-only'),STARFLOW_MAIL_DB_URL:url('sf_mail_budget_connect','mail-only')};
 for(const badRole of ['sf_business_connect','sf_fresh_account_connect']){
  const pools=[];let sends=0;
  class Pool{constructor(cfg){this.cfg=cfg;pools.push(this);}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:this.cfg.user!==badRole}]};}async end(){this.closed=true;}}
  const h=createPreviewHandler({env:cfg,authorizePreview:async()=>true,Pool,registrationMail:{verifyBilling:async()=>true,transport:async()=>{sends++;throw Error('no send allowed');},apiKey:'fixture-key',sender:'fixture@example.invalid',recipientSecret:'fixture-only-secret-not-real-32chars'}});
  const response=await h(req('/api/identity/auth/sign-up/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'fixture@example.invalid',name:'Fixture',username:'fixture',password:'synthetic-test-password'})}));
  assert.equal(response.status,503);assert.equal(sends,0);
  assert.deepEqual(pools.map(p=>p.cfg.user),['sf_auth_runtime','sf_business_connect','sf_fresh_account_connect','sf_registration_connect','sf_mail_budget_connect']);
  assert.ok(pools.every(p=>p.closed));
 }
});

test('registration refuses an unavailable or non-free mail plan before creating an auth account',async()=>{
 const cfg={...env,STARFLOW_REGISTRATION_PREVIEW_ENABLED:'true',STARFLOW_FRESH_PREVIEW_ENABLED:'true',
 STARFLOW_FRESH_DB_URL:url('sf_fresh_account_connect','fresh-only'),STARFLOW_REGISTRATION_DB_URL:url('sf_registration_connect','issuer-only'),STARFLOW_MAIL_DB_URL:url('sf_mail_budget_connect','mail-only')};
 for(const response of [()=>Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:0}]}),()=>Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'paid',creditsType:'sendLimit',credits:100}]}),()=>new Response('',{status:503})]){
  const pools=[];let checks=0;
  class Pool{constructor(cfg){this.cfg=cfg;pools.push(this);}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async connect(){throw Error('signup must never start');}async end(){this.closed=true;}}
  const h=createPreviewHandler({env:cfg,authorizePreview:async()=>true,Pool,registrationMail:{verifyBilling:async()=>true,transport:async(target,options)=>{checks++;assert.equal(target,'https://api.brevo.com/v3/account');assert.equal(options.method,'GET');return response();},apiKey:'fixture-key',sender:'fixture@example.invalid',recipientSecret:'fixture-only-secret-not-real-32chars'}});
  const result=await h(req('/api/identity/auth/sign-up/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'fixture@example.invalid',name:'Fixture',username:'fixture',password:'synthetic-test-password'})}));
  assert.equal(result.status,503);assert.equal(checks,1);assert.equal(pools.length,5);assert.ok(pools.every(p=>p.closed));
 }
});

test('verified Access assertion and service credentials never reach downstream auth',async()=>{
 let calls=0;
 class Pool{constructor(cfg){this.cfg=cfg;}async query(sql){return {rows:[sql.includes('session_user')?{role:this.cfg.user,login:this.cfg.user,db:'neondb',restricted:true}:{safe:true}]};}async end(){}}
 const names=['x-starflow-preview-key','cf-access-jwt-assertion','cf-access-authenticated-user-email','cf-access-client-id','cf-access-client-secret'];
 const headers=new Headers(names.map(name=>[name,'synthetic-fixture']));
 headers.set('cookie','session_token=fixture');headers.set('origin',origin);
 const h=createPreviewHandler({env,Pool,authorizePreview:async request=>{assert.equal(request.headers.get('cf-access-jwt-assertion'),'synthetic-fixture');return true;},
 authFactory:()=>({handler:async request=>{calls++;for(const name of names)assert.equal(request.headers.get(name),null);assert.equal(request.headers.get('cookie'),'session_token=fixture');assert.equal(request.headers.get('origin'),origin);return Response.json({ok:true});}})});
 assert.equal((await h(req('/api/identity/auth/get-session',{headers}))).status,200);assert.equal(calls,1);
});
