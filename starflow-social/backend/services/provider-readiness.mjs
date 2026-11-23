// Owner-authenticated preview-only, read-only provider credential probes.
// Never sends an email, uploads media, exposes credentials or certifies paid billing.
import {Buffer} from 'node:buffer';
import {freeMailPlan} from './brevo-free.mjs';

const secureString=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\r\n]/.test(value);
const senderEmail=/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
async function boundedJSON(response){
 if(response?.status!==200||response.redirected||!response.body||
  response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return null;
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>65536){void reader.cancel().catch(()=>{});return null;}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let pos=0;
 for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return null;}
}

export async function inspectProviderBindings(env={},transport=fetch){
 const results={brevo:'not_configured',sender:'not_configured',cloudinary:'not_configured'};
 if(typeof transport!=='function')return Object.freeze(results);
 if(secureString(env.BREVO_API_KEY)){
  results.brevo='unconfirmed';
  try{
   const r=await transport('https://api.brevo.com/v3/account',{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{'api-key':env.BREVO_API_KEY,accept:'application/json'},signal:AbortSignal.timeout(5000)
   });
   const body=await boundedJSON(r);
   if(freeMailPlan(body))results.brevo='free_account_authorized';
  }catch{/* No credential, provider error or user details in diagnostic results. */}
 }
 // An active Brevo sender is independently checked, but is not proof of domain
 // authentication, mailbox delivery, billing approval or permission to send.
 const sender=env.STARFLOW_BREVO_SENDER_EMAIL;
 if(secureString(env.BREVO_API_KEY)&&typeof sender==='string'&&sender.length<=254&&
    sender===sender.trim()&&senderEmail.test(sender)){
  results.sender='unconfirmed';
  if(results.brevo==='free_account_authorized'){
   try{
    const r=await transport('https://api.brevo.com/v3/senders',{
     method:'GET',redirect:'error',cache:'no-store',
     headers:{'api-key':env.BREVO_API_KEY,accept:'application/json'},signal:AbortSignal.timeout(5000)
    });
    const body=await boundedJSON(r);
    if(Array.isArray(body?.senders)&&body.senders.length<=500&&
       body.senders.some(item=>item&&item.email===sender&&item.active===true))
      results.sender='active_sender_authorized';
   }catch{/* No sender identity, provider errors or credential details in diagnostics. */}
  }
 }
 const cloud=env.CLOUDINARY_CLOUD_NAME,key=env.CLOUDINARY_API_KEY,secret=env.CLOUDINARY_API_SECRET;
 if(typeof cloud==='string'&&/^[a-z0-9_-]{1,80}$/.test(cloud)&&
  typeof key==='string'&&/^\d{5,30}$/.test(key)&&secureString(secret)){
  results.cloudinary='unconfirmed';
  try{
   const r=await transport('https://api.cloudinary.com/v1_1/'+cloud+'/usage',{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),accept:'application/json'},
    signal:AbortSignal.timeout(5000)
   });
   const body=await boundedJSON(r);
   // Successful read-only Admin API usage access; not proof of free billing or upload authorization.
   if(body&&typeof body==='object'&&!Array.isArray(body)&&
     (Object.hasOwn(body,'credits')||Object.hasOwn(body,'resources')||Object.hasOwn(body,'bandwidth'))){
    results.cloudinary='usage_access_authorized';
   }
  }catch{/* Fail closed without surfacing provider details. */}
 }
 return Object.freeze(results);
}
