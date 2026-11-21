// Isolated step-up adapter. No production route. Use Better Auth's real TOTP endpoint,
// existing authenticated session and a separate restricted proof-issuer connection.
import {createHmac} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sessionOK=s=>uuid(s?.user?.id)&&uuid(s?.session?.id)&&s.user.emailVerified===true&&s.user.twoFactorEnabled===true&&s.session.userId===s.user.id&&Date.parse(s.session.expiresAt)>Date.now();
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function body(req){
 if(!req.body||req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('request');
 const reader=req.body.getReader(),chunks=[];let n=0;
 try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.byteLength;if(n>1024){await reader.cancel();throw Error('size');}chunks.push(r.value);}}finally{reader.releaseLock();}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export function createIdentityStepupHandler({auth,pool,origin,replayKey}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://')||!Buffer.isBuffer(replayKey)||replayKey.length!==32)throw Error('configuration');
 return async req=>{
  const url=new URL(req.url);
  if(url.origin!==origin||req.headers.get('origin')!==origin||req.method!=='POST')return reply(403,{error:'not_permitted'});
  if(url.pathname!=='/api/v2/admin/identity/stepup'||url.search)return reply(404,{error:'not_found'});
  let data;try{data=await body(req);}catch{return reply(400,{error:'invalid_request'});}
  if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).length!==3||typeof data.code!=='string'||!/^\d{6}$/.test(data.code)||!(data.subject===null||uuid(data.subject))||!(data.before===null||uuid(data.before)))return reply(400,{error:'invalid_request'});
  let client,discard=false;
  try{
   const initial=await auth.api.getSession({headers:req.headers});
   if(!sessionOK(initial))return reply(401,{error:'not_permitted'});
   // Better Auth must perform the actual cryptographic check and normal rate limiting.
   // Never accept a browser-provided auth result, trustDevice, backup code or cookie mutation.
   const headers=new Headers(req.headers);headers.delete('content-length');headers.delete('x-starflow-preview-key');
   const checked=await auth.handler(new Request(origin+'/api/identity/auth/two-factor/verify-totp',{method:'POST',headers,body:JSON.stringify({code:data.code,trustDevice:false})}));
   if(!checked.ok)return reply(403,{error:'not_permitted'});
   const verified=await checked.json();
   if(verified?.user?.id!==initial.user.id)return reply(403,{error:'not_permitted'});
   const current=await auth.api.getSession({headers:req.headers});
   if(!sessionOK(current)||current.user.id!==initial.user.id||current.session.id!==initial.session.id)return reply(403,{error:'not_permitted'});
   const fingerprint=createHmac('sha256',replayKey).update(JSON.stringify(['identity-queue-totp-v1',current.user.id,data.code])).digest();
   client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL ROLE sf_identity_proof_issuer');
   const r=await client.query('SELECT sf_core.issue_identity_queue_proof($1,$2,$3,$4,$5) AS proof',[current.user.id,current.session.id,data.subject,data.before,fingerprint]);
   if(!uuid(r.rows[0]?.proof)){await client.query('ROLLBACK');return reply(403,{error:'not_permitted'});}
   await client.query('COMMIT');return reply(200,{proof:r.rows[0].proof});
  }catch(e){if(client)try{await client.query('ROLLBACK');}catch{discard=true;}return reply(503,{error:'unavailable'});}
  finally{client?.release(discard);}
 };
}
