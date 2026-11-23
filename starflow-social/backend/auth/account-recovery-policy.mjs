// Server-only preflight policy, NOT authorization to redeem a reset token or mint a session.
// Caller uses a separate login that can SET only sf_account_recovery_gateway.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createOrdinaryRecoveryPolicy(pool){
 async function allowed(subject,email=null){
  if(typeof subject!=='string'||!uuid.test(subject)||email!==null&&(typeof email!=='string'||email.length>254||!email.includes('@')))return false;
  let c,discard=false;
  try{
   c=await pool.connect();await c.query('BEGIN READ ONLY');await c.query('SET LOCAL ROLE sf_account_recovery_gateway');
   const result=await c.query('SELECT sf_core.ordinary_recovery_allowed($1,$2) AS allowed',[subject,email]);
   await c.query('COMMIT');return result.rows.length===1&&result.rows[0].allowed===true;
  }catch{if(c){discard=true;try{await c.query('ROLLBACK');}catch{}}return false;}
  finally{c?.release(discard);}
 }
 return Object.freeze({
  allowResetRecipient:async subject=>subject?.purpose==='reset'&&typeof subject.email==='string'&&await allowed(subject.id,subject.email),
  allowOtpSubject:async subject=>await allowed(subject)
 });
}
