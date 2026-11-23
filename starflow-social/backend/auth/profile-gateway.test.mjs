import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readOwnProfile} from './profile-gateway.mjs';
const subject='33333333-3333-4333-8333-333333333333',id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('gateway uses explicit verified subject binding, no browser account claim, and clears transaction context',async()=>{
 const owner=new pg.Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'ephemeral-ci-only',database:'starflow_auth_test',max:1});
 let pool;
 try{
  await owner.query("CREATE ROLE sf_test_gateway_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD 'synthetic-gateway-ci-only'");
  await owner.query('GRANT sf_session_gateway TO sf_test_gateway_login');
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1),($2)',[id,other]);
  await owner.query("INSERT INTO sf_core.profiles(id,handle) VALUES($1,'fixture_a'),($2,'fixture_b')",[id,other]);
  await owner.query('INSERT INTO sf_core.auth_bindings(principal_id,auth_subject) VALUES($1,$2)',[id,subject]);
  pool=new pg.Pool({host:'127.0.0.1',port:5432,user:'sf_test_gateway_login',password:'synthetic-gateway-ci-only',database:'starflow_auth_test',max:1});
  const authFor=(userId,verified=true)=>({api:{getSession:async()=>({user:{id:userId,emailVerified:verified},session:{userId}})}});
  for(const auth of [{api:{getSession:async()=>null}},authFor(subject,false)])
   assert.deepEqual(await readOwnProfile({auth,pool,headers:new Headers()}),{status:'unauthenticated'});
  assert.deepEqual(await readOwnProfile({auth:authFor(other),pool,headers:new Headers()}),{status:'unbound'});
  const result=await readOwnProfile({auth:authFor(subject),pool,headers:new Headers({'x-user-id':other})});
  assert.equal(result.status,'ok');assert.equal(result.profile.id,id);
  const client=await pool.connect();
  try{
   const state=await client.query("SELECT current_user AS role, current_setting('sf.principal_id',true) AS actor");
   assert.equal(state.rows[0].role,'sf_test_gateway_login');assert.ok(!state.rows[0].actor);
   await assert.rejects(client.query('SELECT * FROM sf_core.auth_bindings'),e=>e.code==='42501');
   await client.query('BEGIN');
   await client.query('SET LOCAL ROLE sf_profile_runtime');
   assert.equal((await client.query('SELECT count(*) AS n FROM sf_core.profiles')).rows[0].n,'0');
   await assert.rejects(client.query('SELECT sf_core.resolve_auth_subject($1)',[subject]),e=>e.code==='42501');
   await client.query('ROLLBACK');
  }finally{client.release();}
 }finally{if(pool)await pool.end();await owner.end();}
});
