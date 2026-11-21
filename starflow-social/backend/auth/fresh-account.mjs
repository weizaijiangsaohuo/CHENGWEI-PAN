// Internal trusted-session adapter. Not an HTTP route; no admission issuance.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function provisionFreshAccount({auth,pool,headers}){
 let c,discard=false;
 try{
  const s=await auth.api.getSession({headers});
  const subject=s?.user?.id,sid=s?.session?.id;
  if(!uuid(subject)||!uuid(sid)||s.user.emailVerified!==true||s.session.userId!==subject||!(Date.parse(s.session.expiresAt)>Date.now()))return {status:'not_permitted'};
  c=await pool.connect();await c.query('BEGIN');await c.query('SET LOCAL ROLE sf_fresh_account_gateway');
  const r=await c.query('SELECT sf_core.provision_fresh_account($1,$2) AS principal',[subject,sid]);
  if(r.rows.length!==1||!uuid(r.rows[0].principal)){await c.query('ROLLBACK');return {status:'not_permitted'};}
  await c.query('COMMIT');return {status:'created',principal:r.rows[0].principal};
 }catch{if(c)try{await c.query('ROLLBACK');}catch{discard=true;}return {status:'unavailable'};}
 finally{c?.release(discard);}
}
