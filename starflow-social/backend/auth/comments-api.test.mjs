import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';import {createBusinessHandler} from './business-api.mjs';
test('comments use visible parent, verified actor, scoped cursor, throttling and author-only edits',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:2};const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});let pool;
 const a=randomUUID(),b=randomUUID(),c=randomUUID(),sa=randomUUID(),sb=randomUUID(),sc=randomUUID(),origin='https://comments-fixture.invalid';
 try{
  await owner.query("CREATE ROLE sf_comments_fixture LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD 'synthetic-comments-fixture-only'");
  await owner.query('GRANT sf_session_gateway TO sf_comments_fixture');
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1),($2),($3)',[a,b,c]);
  await owner.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2),($3,$4),($5,$6)',[a,sa,b,sb,c,sc]);
  pool=new pg.Pool({...db,user:'sf_comments_fixture',password:'synthetic-comments-fixture-only'});
  const auth={api:{getSession:async({headers})=>{const sub=({a:sa,b:sb,c:sc})[headers.get('cookie')];return sub?{user:{id:sub,emailVerified:true},session:{userId:sub,expiresAt:new Date(Date.now()+60000)}}:null;}}};
  const handler=createBusinessHandler({auth,pool,origin});
  const call=(method,path,who,data)=>handler(new Request(origin+'/api/v2/'+path,{method,headers:{origin,cookie:who,'content-type':'application/json','x-user-id':a},...(data?{body:JSON.stringify(data)}:{})}));
  const post=async(who,visibility)=>{const r=await call('POST','posts',who,{content:'comment parent fixture',visibility});assert.equal(r.status,201);return (await r.json()).post.id;};
  const p=await post('a','private'),other=await post('c','members');
  const list=(who,id,before)=>call('GET','comments?post='+id+(before?'&before='+before:''),who);
  assert.equal((await list('none',p)).status,401);
  assert.equal((await list('b',p)).status,404);
  assert.equal((await call('POST','comments','b',{post:p,content:'cannot access'})).status,404);
  assert.equal((await call('POST','posts/edit','a',{id:p,content:'member fixture',visibility:'members'})).status,200);
  assert.equal((await call('POST','comments','b',{post:p,content:'forged',author:a})).status,400);
  const r=await call('POST','comments','b',{post:p,content:'comment fixture'});assert.equal(r.status,201);const x=(await r.json()).comment;assert.equal(x.author_id,b);
  assert.equal((await call('POST','comments','b',{post:other,content:'too soon'})).status,429);
  assert.ok((await (await list('a',p)).json()).comments.some(y=>y.id===x.id));
  assert.deepEqual((await (await list('c',other,x.id)).json()).comments,[]);
  assert.equal((await call('POST','comments/edit','a',{id:x.id,content:'forged edit'})).status,404);
  assert.equal((await call('POST','comments/edit','b',{id:x.id,content:'edited'})).status,200);
  assert.equal((await (await list('a',p)).json()).comments.find(y=>y.id===x.id).content,'edited');
  await owner.query('INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES($1,$2)',[c,b]);
  assert.deepEqual((await (await list('c',p)).json()).comments,[]);
  assert.equal((await call('POST','posts/edit','a',{id:p,content:'private again',visibility:'private'})).status,200);
  assert.equal((await list('b',p)).status,404);
  assert.equal((await call('POST','comments/edit','b',{id:x.id,content:'hidden edit'})).status,404);
  const conn=await pool.connect();
  try{
   await conn.query('BEGIN');await conn.query('SET LOCAL ROLE sf_session_gateway');await conn.query('SET LOCAL ROLE sf_profile_runtime');await conn.query("SELECT set_config('sf.principal_id',$1,true)",[b]);
   assert.equal((await conn.query('SELECT count(*)::int AS n FROM sf_core.post_comments WHERE id=$1',[x.id])).rows[0].n,0);
   await assert.rejects(conn.query('SELECT * FROM sf_core.comment_throttle'),e=>e.code==='42501');
  }finally{await conn.query('ROLLBACK');conn.release();}
 }finally{if(pool)await pool.end();await owner.end();}
});
