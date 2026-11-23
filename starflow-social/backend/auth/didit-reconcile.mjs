// Server-only sandbox composition; no public route or paid session creation.
import {createDiditSandboxReconciler} from '../../lib/identity/didit-server.ts';
export function createDatabaseDiditReconciler({pool,config,enabled=false,apiKey,transport}){
 async function query(sql,args){
  const c=await pool.connect();let discard=false;
  try{await c.query('BEGIN');await c.query('SET LOCAL ROLE sf_didit_reconcile_gateway');const r=await c.query(sql,args);await c.query('COMMIT');return r.rows;}
  catch(e){try{await c.query('ROLLBACK');}catch{discard=true;}throw e;}finally{c.release(discard);}
 }
 return createDiditSandboxReconciler({config,enabled,apiKey,transport,
  resolve:async event=>{
   const rows=await query('SELECT * FROM sf_core.resolve_didit_attempt($1,$2,$3,$4,$5)',[config.applicationId,config.workflowId,event.workflowVersion,event.reference,event.sessionId]);
   if(rows.length!==1)return null;
   const r=rows[0],revision=Number(r.revision);
   if(!Number.isSafeInteger(revision)||revision<0)return null;
   return {environment:'sandbox',workflowVersion:event.workflowVersion,revision,binding:{sessionId:event.sessionId,workflowId:config.workflowId,reference:event.reference,nodes:{document:r.document_node,liveness:r.liveness_node,face:r.face_node,...(r.aml_node?{aml:r.aml_node}:{})}}};
  },
  apply:async ({event,attemptId,workflowId,expectedRevision,result})=>{
   const rows=await query('SELECT sf_core.apply_didit_verified_result($1,$2,$3,$4,$5,$6,$7,$8) AS outcome',[config.applicationId,event.eventId,attemptId,event.sessionId,workflowId,event.workflowVersion,expectedRevision,result]);
   return rows.length===1?rows[0].outcome:'retryable';
  }
 });
}
