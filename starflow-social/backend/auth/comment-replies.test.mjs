import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';import {createBusinessHandler} from './business-api.mjs';
test('one-level replies, parent visibility and irreversible author withdrawal under restricted PostgreSQL role',async()=>{
 const cfg={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:2};const owner=new pg.Pool({...cfg,user:'postgres',password:'ephemeral-ci-only'});let pool;
 const a=randomUUID(),b=randomUUID(),c=randomUUID(),sa=randomUUID(),sb=randomUUID(),sc=randomUUID(),origin='https://reply-fixture.invalid';
 try{
  await owner.query("CREATE ROLE sf_reply_fixture LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER PASSWORD 'ci-reply-fixture-only'");
  await owner.query('GRANT sf_session_gateway TO sf_reply_fixture');
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1),($2),($3)',[a,b,c]);
  await owner.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2),($3,$4),($5,$6)',[a,sa,b,sb,c,sc]);
  pool=new pg.Pool({...cfg,user:'sf_reply_fixture',password:'ci-reply-fixture-only'});
  const auth={api:{getSession:async({headers})=>{const sub=({a:sa,b:sb,c:sc})[headers.get('cookie')];return sub?{user:{id:sub,emailVerified:true},session:{userId:sub,expiresAt:new Date(Date.now()+60000)}}:null;}}};
  const app=createBusinessHandler({auth,pool,origin});
  const call=(method,path,who,data)=>app(new Request(origin+'/api/v2/'+path,{method,headers:{origin,cookie:who,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}));
  const post=async who=>{const r=await call('POST','posts',who,{content:'parent fixture',visibility:'members'});assert.equal(r.status,201);return (await r.json()).post.id;};
  const p=await post('a'),other=await post('c');
  const rootRes=await call('POST','comments','a',{post:p,content:'root fixture'});assert.equal(rootRes.status,201);const root=(await rootRes.json()).comment;
  assert.equal((await call('POST','comments','b',{post:other,content:'cross post',replyTo:root.id})).status,404);
  const replyRes=await call('POST','comments','b',{post:p,content:'reply fixture',replyTo:root.id});assert.equal(replyRes.status,201);const reply=(await replyRes.json()).comment;
  assert.equal(reply.reply_to,root.id);
  assert.equal((await call('POST','comments','c',{post:p,content:'too deep',replyTo:reply.id})).status,404);
  const list=async who=>(await (await call('GET','comments?post='+p,who)).json()).comments;
  const page=await list('c');assert.equal(page.find(x=>x.id===reply.id).reply_to,root.id);
  assert.equal((await call('POST','comments/withdraw','b',{id:root.id})).status,404);
  const withdraw=await call('POST','comments/withdraw','a',{id:root.id});assert.equal(withdraw.status,200);
  assert.equal((await call('POST','comments/withdraw','a',{id:root.id})).status,200);
  const updated=(await list('c')).find(x=>x.id===root.id);assert.ok(updated.withdrawn_at);assert.equal(updated.content,'[已撤回]');
  assert.equal((await call('POST','comments/edit','a',{id:root.id,content:'restore'})).status,404);
  assert.equal((await call('POST','comments','c',{post:p,content:'withdrawn target',replyTo:root.id})).status,404);
  await owner.query('INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES($1,$2)',[c,b]);
  assert.ok(!(await list('c')).some(x=>x.id===reply.id));
  assert.equal((await call('POST','comments/withdraw','b',{id:reply.id})).status,200);
  const actual=(await owner.query('SELECT content,withdrawn_at FROM sf_core.post_comments WHERE id=$1',[reply.id])).rows[0];assert.equal(actual.content,'[已撤回]');assert.ok(actual.withdrawn_at);
 }finally{if(pool)await pool.end();await owner.end();}
});
