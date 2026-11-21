import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {betterAuth} from 'better-auth';import {authOptions} from './auth.mjs';import {createAuthMailCallbacks} from './auth-mail.mjs';
test('actual Better Auth verification and password recovery callbacks through restricted committed mail budget',async()=>{
 const conn={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:2};
 const owner=new pg.Pool({...conn,user:'postgres',password:'ephemeral-ci-only'});let pool,authPool;
 const origin='https://mail-ceremony.example.invalid',email='mail-ceremony@example.invalid',oldPassword='synthetic-fixture-old-password-2026',newPassword='synthetic-fixture-new-password-2026';
 const sent=[];let permitted=true;
 try{
  const info=(await owner.query('SELECT current_database() AS db,current_user AS role')).rows[0];assert.deepEqual(info,{db:'starflow_auth_test',role:'postgres'});
  await owner.query("CREATE ROLE sf_mail_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'ci-mail-fixture-only'");
  await owner.query('GRANT sf_mail_budget_gateway TO sf_mail_fixture WITH SET TRUE, INHERIT FALSE');
  await owner.query("ALTER ROLE sf_auth_runtime LOGIN PASSWORD 'ci-auth-mail-fixture-only'");
  pool=new pg.Pool({...conn,user:'sf_mail_fixture',password:'ci-mail-fixture-only'});
  authPool=new pg.Pool({...conn,user:'sf_auth_runtime',password:'ci-auth-mail-fixture-only'});
  const cb=createAuthMailCallbacks({enabled:true,pool,origin,apiKey:'synthetic',sender:'security@example.invalid',recipientSecret:'independent-synthetic-mail-ceremony-secret',
   allowRecipient:async subject=>permitted&&subject.email===email,confirmFreePlan:async()=>true,transport:async(url,opts)=>{
    const msg=JSON.parse(opts.body);assert.equal(msg.to[0].email,email);
    const id=msg.headers.IdempotencyKey;
    const q=await owner.query('SELECT purpose FROM sf_core.otp_mail_attempts WHERE event_id=$1',[id]);assert.equal(q.rowCount,1);
    sent.push({eventId:id,purpose:q.rows[0].purpose,link:msg.textContent.split('\n')[1]});
    return Response.json({messageId:'synthetic'},{status:201});
   }});
  const base=authOptions({database:authPool,origin,secret:'synthetic-auth-mail-ceremony-secret-2026'});
  const auth=betterAuth({...base,emailAndPassword:{...base.emailAndPassword,disableSignUp:false,sendResetPassword:cb.sendResetPassword},
    emailVerification:{...base.emailVerification,sendOnSignUp:true,sendVerificationEmail:cb.sendVerificationEmail}});
  const headers={origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.100'};
  const post=(path,body,cookie)=>auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:'POST',headers:{...headers,...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
  const signup=await post('sign-up/email',{email,password:oldPassword,name:'Mail fixture',username:'mail_ceremony',callbackURL:origin+'/'});assert.ok(signup.ok,'signup '+signup.status);
  assert.equal(sent.length,1);assert.equal(sent[0].purpose,'verify');
  const verification=await auth.handler(new Request(sent[0].link,{headers}));assert.ok(verification.ok||verification.status===302);
  const login=await post('sign-in/email',{email,password:oldPassword});assert.ok(login.ok);
  const cookie=login.headers.getSetCookie().find(v=>v.includes('session_token=')).split(';')[0];
  assert.equal((await auth.api.getSession({headers:new Headers({cookie})})).user.emailVerified,true);
  // Only age the fixture attempt in the disposable test DB; not a production quota bypass.
  const aged=await owner.query("UPDATE sf_core.otp_mail_attempts SET reserved_at=clock_timestamp()-interval '2 minutes' WHERE event_id=$1 AND purpose='verify' RETURNING event_id",[sent[0].eventId]);
  assert.equal(aged.rowCount,1);
  const request=await post('request-password-reset',{email,redirectTo:origin+'/reset-password'});assert.ok(request.ok);
  assert.equal(sent.length,2);assert.equal(sent[1].purpose,'reset');
  const link=new URL(sent[1].link);assert.equal(link.pathname,'/reset-password');
  const token=link.searchParams.get('token');assert.ok(token);
  assert.ok((await post('reset-password',{token,newPassword})).ok);
  assert.equal(await auth.api.getSession({headers:new Headers({cookie})}),null);
  assert.equal((await post('sign-in/email',{email,password:oldPassword})).ok,false);
  assert.ok((await post('sign-in/email',{email,password:newPassword})).ok);
  assert.equal((await post('reset-password',{token,newPassword:oldPassword})).ok,false);
  permitted=false;
  assert.ok((await post('request-password-reset',{email,redirectTo:origin+'/reset-password'})).ok);
  assert.equal(sent.length,2);
 }finally{await Promise.allSettled([pool,authPool].filter(Boolean).map(p=>p.end()));try{await owner.query("ALTER ROLE sf_auth_runtime NOLOGIN PASSWORD NULL");}finally{await owner.end();}}
});
