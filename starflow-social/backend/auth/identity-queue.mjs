// Private workbench metadata adapter. No mounted route or raw materials.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function readBody(req){
 if(!req.body||req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('body');
 const reader=req.body.getReader();let size=0;const chunks=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024){await reader.cancel();throw Error('size');}chunks.push(r.value);}}finally{reader.releaseLock();}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
const states=new Set(['reserved','pending','review','declined','cancelled','checks_passed']);
const kinds=new Set(['face_photo','document_front','document_back','identity_fields']);
function sessionIdentity(session){
 const subject=session?.user?.id,sid=session?.session?.id;
 if(!uuid(subject)||!uuid(sid)||session.user.emailVerified!==true||session.session.userId!==subject||
  !(Date.parse(session.session.expiresAt)>Date.now()))return null;
 return {subject,sid};
}
function canonicalDate(v){
 if(!(v instanceof Date)&&typeof v!=='string')throw Error('date');
 const n=Date.parse(v instanceof Date?v.toISOString():v);
 if(!Number.isFinite(n))throw Error('date');
 return new Date(n).toISOString();
}
function casePage(rows,filter,before){
 if(!Array.isArray(rows)||rows.length>51)throw Error('result');
 const seen=new Set();
 const all=rows.map(r=>{
  if(!r||!uuid(r.attempt_id)||!uuid(r.principal_id)||(filter!==null&&r.principal_id.toLowerCase()!==filter.toLowerCase())||
   (before!==null&&r.attempt_id.toLowerCase()===before.toLowerCase())||seen.has(r.attempt_id.toLowerCase())||
   !states.has(r.state)||!Array.isArray(r.evidence_kinds)||r.evidence_kinds.length>4||
   !r.evidence_kinds.every(k=>kinds.has(k))||new Set(r.evidence_kinds).size!==r.evidence_kinds.length||
   (r.evidence_kinds.length>0&&r.retained_until===null))throw Error('result');
  seen.add(r.attempt_id.toLowerCase());
  const retained=r.retained_until===null?null:canonicalDate(r.retained_until);
  const active=retained!==null&&Date.parse(retained)>Date.now();
  return {attemptId:r.attempt_id,principalId:r.principal_id,state:r.state,submittedAt:canonicalDate(r.submitted_at),
   evidenceKinds:active?[...r.evidence_kinds]:[],retainedUntil:active?retained:null};
 });
 const cases=all.slice(0,50);
 return {cases,next:all.length===51?cases[49].attemptId:null};
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
  let client,discard=false,committed=false;
  try{
   const initial=sessionIdentity(await auth.api.getSession({headers:req.headers}));
   if(!initial)return reply(401,{error:'unauthenticated'});
   const {subject,sid}=initial;
   client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL ROLE sf_identity_queue_gateway');
   const result=await client.query('SELECT * FROM sf_core.list_identity_cases($1,$2,$3,$4,$5)',[subject,sid,data.proof,data.subject,data.before]);
   const page=casePage(result.rows,data.subject,data.before);
   await client.query('COMMIT');committed=true;
   // Preserve the consumed proof/audit even if authorization disappears before delivery.
   const current=sessionIdentity(await auth.api.getSession({headers:req.headers}));
   if(!current||current.subject!==subject||current.sid!==sid)return reply(401,{error:'unauthenticated'});
   // Recheck evidence expiration after the final session query.
   for(const item of page.cases)if(item.retainedUntil!==null&&Date.parse(item.retainedUntil)<=Date.now()){
    item.evidenceKinds=[];item.retainedUntil=null;
   }
   return reply(200,page);
  }catch(e){if(client&&!committed)try{await client.query('ROLLBACK');}catch{discard=true;}return e?.code==='42501'?reply(403,{error:'not_permitted'}):reply(503,{error:'unavailable'});}
  finally{client?.release(discard);}
 };
}
