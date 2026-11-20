import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {createBusinessHandler} from './business-api.mjs';
const origin='https://example.invalid',a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',sa='33333333-3333-4333-8333-333333333333',sb='44444444-4444-4444-8444-444444444444';
test('real SQL through HTTP requests, distinct sessions and private notifications',async()=>{
 const cfg={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...cfg,user:'postgres',password:'ephemeral-ci-only'});let pool;
 try{
  await owner.query("CREATE ROLE sf_api_fixture LOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS PASSWORD 'synthetic-api-fixture-only'");
  await owner.query('GRANT sf_session_gateway TO sf_api_fixture');
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1),($2)',[a,b]);
  await owner.query("INSERT INTO sf_core.profiles(id,handle) VALUES($1,'api_a'),($2,'api_b')",[a,b]);
  await owner.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2),($3,$4)',[a,sa,b,sb]);
  await owner.query('INSERT INTO sf_core.follows(follower_id,target_id,accepted) VALUES($1,$2,true),($2,$1,true)',[a,b]);
  pool=new pg.Pool({...cfg,user:'sf_api_fixture',password:'synthetic-api-fixture-only'});
  // This fixture mocks only authenticated session output. All SQL is executed with restricted login.
  const auth={api:{getSession:async({headers})=>{const id=({'fixture-a':sa,'fixture-b':sb})[headers.get('cookie')];return id?{user:{id,emailVerified:true},session:{userId:id,expiresAt:new Date(Date.now()+60000)}}:null;}}};
  const handle=createBusinessHandler({auth,pool,origin});
  const call=(method,path,cookie,data,from=origin)=>handle(new Request(origin+path,{method,headers:{origin:from,cookie,'content-type':'application/json','x-user-id':b},...(data?{body:JSON.stringify(data)}:{})}));
  assert.equal((await call('GET','/api/v2/me','none')).status,401);
  const me=await call('GET','/api/v2/me','fixture-a');assert.equal((await me.json()).profile.id,a);
  assert.equal((await call('POST','/api/v2/messages','fixture-a',{recipient:b,body:'hi'},'https://evil.invalid')).status,403);
  assert.equal((await call('POST','/api/v2/messages','fixture-a',{recipient:b,body:'hi',sender:b})).status,400);
  const sent=await call('POST','/api/v2/messages','fixture-a',{recipient:b,body:'hi'});
  assert.equal(sent.status,201);
  const messages=await (await call('GET','/api/v2/messages','fixture-b')).json();assert.equal(messages.messages[0].sender_id,a);
  assert.equal((await call('GET','/api/v2/messages?after=-1','fixture-b')).status,400);
  const notices=await (await call('GET','/api/v2/notifications','fixture-b')).json();assert.equal(notices.notifications.length,1);
  const id=notices.notifications[0].id;
  assert.equal((await call('POST','/api/v2/notifications/read','fixture-a',{id})).status,404);
  assert.equal((await call('POST','/api/v2/notifications/read','fixture-b',{id})).status,200);
  assert.equal((await call('GET','/api/v2/notifications','fixture-a')).headers.get('cache-control'),'no-store, private');
  await owner.query('INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES($1,$2)',[b,a]);
  assert.equal((await (await call('GET','/api/v2/messages','fixture-b')).json()).messages.length,0);
  assert.equal((await call('POST','/api/v2/messages','fixture-a',{recipient:b,body:'blocked'})).status,403);
 }finally{if(pool)await pool.end();await owner.end();}
});
