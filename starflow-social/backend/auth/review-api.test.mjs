import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {createReviewHandler} from './review-api.mjs';
const origin='https://review.example.invalid';
const a='11111111-1111-4111-8111-111111111111',s='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333',proof='44444444-4444-4444-8444-444444444444';
test('review API requires dedicated role, valid session and one-time proof',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});let pool;
 try{
  // Reuse existing business fixture a as staff; no real role or user is modified.
  await owner.query('INSERT INTO sf_core.staff_roles(principal_id,role,enabled) VALUES($1,$2,true)',[a,'moderator']);
  const subject=(await owner.query('SELECT auth_subject FROM sf_core.auth_bindings WHERE principal_id=$1',[a])).rows[0].auth_subject;
  await owner.query("CREATE ROLE sf_review_fixture LOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS PASSWORD 'synthetic-review-fixture-only'");
  await owner.query('GRANT sf_review_gateway TO sf_review_fixture');
  pool=new pg.Pool({...db,user:'sf_review_fixture',password:'synthetic-review-fixture-only'});
  await owner.query("INSERT INTO sf_core.staff_stepup(id,principal_id,session_id,method,purpose,expires_at) VALUES($1,$2,$3,'totp','review_queue',clock_timestamp()+interval '4 minutes')",[proof,a,sid]);
  const auth={api:{getSession:async({headers})=>headers.get('cookie')==='fixture'?{user:{id:subject,emailVerified:true},session:{id:sid,userId:subject,expiresAt:new Date(Date.now()+60000)}}:null}};
  const handler=createReviewHandler({auth,pool,origin});
  const request=(data,cookie='fixture',from=origin)=>handler(new Request(origin+'/api/v2/admin/review-queue',{method:'POST',headers:{origin:from,cookie,'content-type':'application/json'},body:JSON.stringify(data)}));
  assert.equal((await request({proof},'none')).status,401);
  assert.equal((await request({proof},'fixture','https://evil.invalid')).status,403);
  assert.equal((await request({proof,actor:a})).status,400);
  assert.equal((await request({proof:s})).status,403);
  const q=await request({proof});assert.equal(q.status,200);assert.ok(Array.isArray((await q.json()).reports));
  assert.equal((await request({proof})).status,403);
  const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE sf_review_gateway');
   await assert.rejects(c.query("SELECT * FROM sf_core.staff_stepup"),e=>e.code==='42501');await c.query('ROLLBACK');
  }finally{c.release();}
 }finally{if(pool)await pool.end();await owner.end();}
});
