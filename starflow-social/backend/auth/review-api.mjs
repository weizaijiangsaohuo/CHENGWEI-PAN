// Isolated review API; no production route. Use a separate sf_review_gateway login.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(s,v)=>Response.json(v,{status:s,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function boundedJson(req){
 if(!req.body||req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('body');
 const reader=req.body.getReader(),parts=[];let length=0;
 try{while(true){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>2048){await reader.cancel();throw Error('size');}parts.push(r.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('shape');return data;
}
export function createReviewHandler({auth,pool,origin}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('origin');
 return async request=>{
  const url=new URL(request.url);
  if(url.origin!==origin||request.headers.get('origin')!==origin||request.method!=='POST')return reply(403,{error:'not_permitted'});
  if(url.search||!['/api/v2/admin/review-queue','/api/v2/admin/reports/review'].includes(url.pathname))return reply(404,{error:'not_found'});
  const isQueue=url.pathname.endsWith('review-queue');
  let data;try{data=await boundedJson(request);}catch{return reply(400,{error:'invalid_request'});}
  const keys=isQueue?['proof']:['proof','report','decision'];
  if(Object.keys(data).length!==keys.length||!keys.every(k=>Object.hasOwn(data,k))||!uuid(data.proof)||
    (!isQueue&&(!uuid(data.report)||!['hidden','dismissed'].includes(data.decision))))return reply(400,{error:'invalid_request'});
  let client,discard=false;
  try{
   const session=await auth.api.getSession({headers:request.headers});
   const subject=session?.user?.id,sid=session?.session?.id;
   if(!uuid(subject)||!uuid(sid)||session.user.emailVerified!==true||session.session.userId!==subject||
     !(Date.parse(session.session.expiresAt)>Date.now()))return reply(401,{error:'unauthenticated'});
   client=await pool.connect();await client.query('BEGIN');
   await client.query('SET LOCAL ROLE sf_review_gateway');
   const id=(await client.query('SELECT sf_core.resolve_auth_subject($1::uuid) AS id',[subject])).rows[0]?.id;
   if(!uuid(id)){await client.query('ROLLBACK');return reply(403,{error:'not_permitted'});}
   let result;
   if(isQueue){result={reports:(await client.query('SELECT * FROM sf_core.open_review_queue($1,$2,$3,50)',[id,sid,data.proof])).rows};}
   else{const ok=(await client.query('SELECT sf_core.review_community_report($1,$2,$3,$4,$5) AS ok',[id,sid,data.proof,data.report,data.decision])).rows[0]?.ok;
    if(ok!==true){await client.query('ROLLBACK');return reply(403,{error:'not_permitted'});}result={ok:true};}
   await client.query('COMMIT');return reply(200,result);
  }catch(e){if(client){try{await client.query('ROLLBACK');}catch{discard=true;}}return e?.code==='42501'?reply(403,{error:'not_permitted'}):reply(503,{error:'unavailable'});}
  finally{client?.release(discard);}
 };
}
