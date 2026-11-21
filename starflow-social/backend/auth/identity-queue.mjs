// Private workbench metadata adapter. No mounted route or raw materials.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function readBody(req){
 if(!req.body||req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('body');
 const reader=req.body.getReader();let size=0;const chunks=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024){await reader.cancel();throw Error('size');}chunks.push(r.value);}}finally{reader.releaseLock();}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export function createIdentityQueueHandler({auth,pool,origin}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('origin');
 return async req=>{
  const url=new URL(req.url);
  if(url.origin!==origin||req.headers.get('origin')!==origin||req.method!=='POST')return reply(403,{error:'not_permitted'});
  if(url.pathname!=='/api/v2/admin/identity/cases'||url.search)return reply(404,{error:'not_found'});
  let data;try{data=await readBody(req);}catch{return reply(400,{error:'invalid_request'});}
  if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).length!==3||!uuid(data.proof)||
  !Object.hasOwn(data,'subject')||!Object.hasOwn(data,'before')||
  !(data.subject===null||uuid(data.subject))||!(data.before===null||uuid(data.before)))return reply(400,{error:'invalid_request'});
  let client,discard=false;
  try{
   const session=await auth.api.getSession({headers:req.headers});
   const subject=session?.user?.id,sid=session?.session?.id;
   if(!uuid(subject)||!uuid(sid)||session.user.emailVerified!==true||session.session.userId!==subject||!(Date.parse(session.session.expiresAt)>Date.now()))return reply(401,{error:'unauthenticated'});
   client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL ROLE sf_identity_queue_gateway');
   const result=await client.query('SELECT * FROM sf_core.list_identity_cases($1,$2,$3,$4,$5)',[subject,sid,data.proof,data.subject,data.before]);
   if(!Array.isArray(result.rows)||result.rows.length>51)throw Error('result');
   const cases=result.rows.slice(0,50).map(r=>({attemptId:r.attempt_id,principalId:r.principal_id,state:r.state,submittedAt:r.submitted_at,evidenceKinds:r.evidence_kinds,retainedUntil:r.retained_until}));
   const next=result.rows.length===51?cases[49].attemptId:null;
   await client.query('COMMIT');return reply(200,{cases,next});
  }catch(e){if(client)try{await client.query('ROLLBACK');}catch{discard=true;}return e?.code==='42501'?reply(403,{error:'not_permitted'}):reply(503,{error:'unavailable'});}
  finally{client?.release(discard);}
 };
}
