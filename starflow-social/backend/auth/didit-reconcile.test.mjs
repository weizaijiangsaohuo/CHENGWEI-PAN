import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';import pg from 'pg';import {createDatabaseDiditReconciler} from './didit-reconcile.mjs';
test('signed synthetic sandbox decision reaches PostgreSQL using restricted gateway',async()=>{
 const db={host:'127.0.0.1',port:5432,database:'starflow_auth_test',max:1};
 const owner=new pg.Pool({...db,user:'postgres',password:'ephemeral-ci-only'});let pool;
 const principal=randomUUID(),reference=randomUUID(),sessionId=randomUUID(),workflowId=randomUUID(),applicationId=randomUUID(),eventId=randomUUID();
 const config={environment:'sandbox',workflowId,applicationId,workflowVersion:1,secret:'synthetic-sandbox-only-reconcile-key'};
 const now=Math.floor(Date.now()/1000);
 const event={event_id:eventId,session_id:sessionId,vendor_data:reference,workflow_id:workflowId,application_id:applicationId,workflow_version:1,environment:'sandbox',session_kind:'user',webhook_type:'status.updated',timestamp:now};
 const raw=Buffer.from(JSON.stringify(event)),sig=createHmac('sha256',config.secret).update(raw).digest('hex');
 const feature=(node_id,extra={})=>({node_id,status:'Approved',warnings:[],...extra});
 const report={session_id:sessionId,workflow_id:workflowId,vendor_data:reference,environment:'sandbox',session_kind:'user',status:'Approved',id_verifications:[feature('doc')],liveness_checks:[feature('live',{method:'ACTIVE_3D'})],face_matches:[feature('face',{source_image_session_id:null})]};
 try{
  await owner.query('INSERT INTO sf_core.principals(id) VALUES($1)',[principal]);
  await owner.query("INSERT INTO sf_core.identity_attempts(id,principal_id,provider_session_id,workflow_id,workflow_version,state) VALUES($1,$2,$3,$4,1,'pending')",[reference,principal,sessionId,workflowId]);
  await owner.query("INSERT INTO sf_core.didit_sandbox_workflows(workflow_id,workflow_version,application_id,document_node,liveness_node,face_node,enabled) VALUES($1,1,$2,'doc','live','face',true)",[workflowId,applicationId]);
  await owner.query("CREATE ROLE sf_didit_fixture LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'ci-didit-fixture-only'");
  await owner.query('GRANT sf_didit_reconcile_gateway TO sf_didit_fixture WITH SET TRUE, INHERIT FALSE');
  pool=new pg.Pool({...db,user:'sf_didit_fixture',password:'ci-didit-fixture-only'});
  let calls=0,offline=true;
  const run=createDatabaseDiditReconciler({pool,config,enabled:true,apiKey:'synthetic-only',transport:async()=>{calls++;return offline?new Response('',{status:503}):Response.json(report)}});
  assert.equal(await run(raw,'0'.repeat(64),String(now),now),'rejected');assert.equal(calls,0);
  assert.equal(await run(raw,sig,String(now),now),'retryable');
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM sf_core.identity_events WHERE event_id=$1',[eventId])).rows[0].n,0);
  offline=false;assert.equal(await run(raw,sig,String(now),now),'applied');
  assert.equal(await run(raw,sig,String(now),now),'duplicate');
  const r=(await owner.query('SELECT state,revision FROM sf_core.identity_attempts WHERE id=$1',[reference])).rows[0];assert.equal(r.state,'checks_passed');assert.equal(Number(r.revision),1);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM sf_core.identity_evidence WHERE attempt_id=$1',[reference])).rows[0].n,0);
 }finally{await Promise.allSettled([pool,owner].filter(Boolean).map(p=>p.end()));}
});
