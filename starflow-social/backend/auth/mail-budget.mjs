// Trusted server-only reservation adapter. Do not expose via a browser endpoint.
// No successful reserve result until PostgreSQL confirms COMMIT.
export function createMailBudgetReservation(pool){
 return async ({eventId,recipientKey,purpose}={})=>{
  if(typeof eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)||
   typeof recipientKey!=='string'||!/^[0-9a-f]{64}$/.test(recipientKey)||!['otp','verify','reset'].includes(purpose))return false;
  let c,discard=false;
  try{
   c=await pool.connect();await c.query('BEGIN');await c.query('SET LOCAL ROLE sf_mail_budget_gateway');
   const result=await c.query('SELECT sf_core.reserve_recipient_mail($1,$2,$3) AS allowed',[eventId,recipientKey,purpose]);
   if(result.rows.length!==1||result.rows[0].allowed!==true){await c.query('ROLLBACK');return false;}
   await c.query('COMMIT');return true;
  }catch{if(c){discard=true;try{await c.query('ROLLBACK');}catch{}}return false;}
  finally{c?.release(discard);}
 };
}
