import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
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
