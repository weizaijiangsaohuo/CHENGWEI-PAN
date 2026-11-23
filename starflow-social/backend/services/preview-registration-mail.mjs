// Preview-only Brevo registration transport binding. No email is sent by this module.
// Absent explicit owner billing signoff, verified sender, required secrets and *all*
// isolated staging switches, this returns undefined and signup stays unavailable.
// The out-of-band billing signoff is an operator declaration; the live Brevo Free
// plan is checked independently for every send by createBrevoFreePlanCheck().
const senderEmail=/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
const clean=(v,min=1,max=512)=>typeof v==='string'&&v.length>=min&&v.length<=max&&v===v.trim()&&!/[\r\n]/.test(v);
async function readSenderStatus(response){
 if(response?.status!==200||response.redirected||!response.body||
  response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return null;
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>32768){void reader.cancel().catch(()=>{});return null;}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return Array.isArray(data?.senders)&&data.senders.length<=500?data.senders:null;
 }catch{return null;}
}
export function createPreviewRegistrationMail(env={}, {transport=fetch}={}){
 if(env.STARFLOW_V2_PREVIEW_ONLY!=='true'||env.STARFLOW_V2_ENABLED!=='true'||
  env.STARFLOW_REGISTRATION_PREVIEW_ENABLED!=='true'||env.STARFLOW_FRESH_PREVIEW_ENABLED!=='true'||
  env.STARFLOW_BREVO_SEND_ENABLED!=='true'||env.STARFLOW_BREVO_BILLING_FREE_ONLY_VERIFIED!=='true'||
  env.STARFLOW_PREVIEW_OWNER_KEY!==undefined||typeof transport!=='function')return undefined;
 const sender=env.STARFLOW_BREVO_SENDER_EMAIL,apiKey=env.BREVO_API_KEY,recipientSecret=env.STARFLOW_MAIL_RECIPIENT_SECRET;
 if(!clean(apiKey)||!clean(sender,3,254)||!senderEmail.test(sender)||
  !clean(recipientSecret,32,512)||recipientSecret===apiKey||recipientSecret===env.BETTER_AUTH_SECRET)return undefined;
 try{
  const origin=new URL(env.STARFLOW_AUTH_ORIGIN);
  if(origin.protocol!=='https:'||origin.origin!==env.STARFLOW_AUTH_ORIGIN||
   !/^[-a-z0-9]+-weizai\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname))return undefined;
 }catch{return undefined;}
 const verifyBilling=async()=>{
  // The operator must separately review payment methods, paid credits and auto-upgrade.
  // GET /v3/senders independently confirms the chosen sender is active; this is
  // NOT proof of no charges. The dispatcher also rechecks GET /v3/account Free plan.
  if(env.STARFLOW_BREVO_BILLING_FREE_ONLY_VERIFIED!=='true')return false;
  try{
   const result=await transport('https://api.brevo.com/v3/senders',{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{'api-key':apiKey,accept:'application/json'},signal:AbortSignal.timeout(5000)
   });
   const senders=await readSenderStatus(result);
   return Array.isArray(senders)&&senders.some(s=>s&&s.active===true&&s.email===sender);
  }catch{return false;}
 };
 return Object.freeze({apiKey,sender,recipientSecret,verifyBilling,transport});
}
