// Internal lab only. Caller must own auth and pool; never expose SQL or callbacks to clients.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readOwnProfile({auth,pool,headers}){
 // Always resolve the authenticated session server-side. No body ID, role or handle accepted.
 const session=await auth.api.getSession({headers});
 const subject=session?.user?.id;
 if(session?.user?.emailVerified!==true||!uuid.test(subject??'')||session?.session?.userId!==subject)
  return {status:'unauthenticated'};
 const client=await pool.connect();
 let destroy=false;
 try{
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE sf_session_gateway');
  const binding=await client.query('SELECT sf_core.resolve_auth_subject($1::uuid) AS id',[subject]);
  const id=binding.rows[0]?.id;
  if(!uuid.test(id??'')){await client.query('ROLLBACK');return {status:'unbound'};}
  await client.query('SET LOCAL ROLE sf_profile_runtime');
  await client.query("SELECT set_config('sf.principal_id',$1,true)",[id]);
  const result=await client.query('SELECT id,handle,display_name,bio FROM sf_core.profiles WHERE id=$1::uuid',[id]);
  await client.query('COMMIT');
  return result.rows.length===1?{status:'ok',profile:result.rows[0]}:{status:'unbound'};
 }catch{
  try{await client.query('ROLLBACK');}catch{destroy=true;}
  return {status:'unavailable'};
 }finally{client.release(destroy);}
}
