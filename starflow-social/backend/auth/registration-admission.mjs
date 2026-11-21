// Trusted internal signup-email ceremony adapter only. No public handler.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createRegistrationAdmission(pool){
 const valid=s=>uuid(s?.id)&&typeof s.email==='string'&&s.email.length<=254&&s.email.includes('@');
 async function call(statement,subject,readOnly){
  if(!valid(subject))return false;
  let c,discard=false;
  try{
   c=await pool.connect();await c.query(readOnly?'BEGIN READ ONLY':'BEGIN');await c.query('SET LOCAL ROLE sf_registration_issuer');
   const r=await c.query(statement,[subject.id,subject.email]);await c.query('COMMIT');
   return r.rows.length===1&&r.rows[0].allowed===true;
  }catch{if(c)try{await c.query('ROLLBACK');}catch{discard=true;}return false;}
  finally{c?.release(discard);}
 }
 return Object.freeze({
  // Caller must be the trusted, successful NEW signup ceremony, never resend or request input.
  issueForNewSignup:s=>s?.emailVerified===false?call('SELECT sf_core.issue_registration_admission($1,$2) AS allowed',s,false):Promise.resolve(false),
  allowRecipient:s=>s?.purpose==='verify'?call('SELECT sf_core.registration_mail_allowed($1,$2) AS allowed',s,true):Promise.resolve(false)
 });
}
