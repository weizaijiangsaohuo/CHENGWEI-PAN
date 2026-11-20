import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewHandler,restrictedPoolConfig} from './preview-runtime.mjs';
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
 const instances=[];class Pool{constructor(cfg){this.cfg=cfg;this.closed=false;instances.push(this);}async end(){this.closed=true;}}
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
  async query(sql){this.queries.push(sql);return {rows:[{role:this.cfg.user,login:this.cfg.user,db:'neondb'}]};}
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
 assert.ok(pools.every(p=>p.closed&&p.queries.length===1));
 class WrongPool extends Pool{async query(){return {rows:[{role:'neondb_owner',login:'neondb_owner',db:'neondb'}]};}}
 const wrong=await make(async()=>true,{Pool:WrongPool})(req('/api/v2/readiness'));
 assert.equal(wrong.status,503);assert.deepEqual(await wrong.json(),{error:'unavailable'});
 class OfflinePool extends Pool{async query(){throw Error('synthetic private connection error');}}
 const offline=await make(async()=>true,{Pool:OfflinePool})(req('/api/v2/readiness'));
 assert.equal(offline.status,503);assert.deepEqual(await offline.json(),{error:'unavailable'});
 assert.ok(pools.every(p=>p.closed));
});
