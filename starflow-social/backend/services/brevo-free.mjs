// Server-side, read-only provider plan preflight. No live route or default transport.
// GET /v3/account: https://developers.brevo.com/reference/get-account
import {createMailDispatcher} from './mail-dispatch.mjs';
export function freeMailPlan(value){
 if(!value||value.enterprise!==false||value.relay?.enabled!==true||!Array.isArray(value.plan)||value.plan.length!==1)return false;
 const plan=value.plan[0];
 if(plan?.type!=='free'||plan.creditsType!=='sendLimit'||!Number.isSafeInteger(plan.credits)||plan.credits<=0)return false;
 if(value.planVerticals!==undefined&&(!Array.isArray(value.planVerticals)||value.planVerticals.length>20||!value.planVerticals.every(p=>p?.planType==='free'&&p.status==='active')))return false;
 return true;
}
export function createBrevoFreePlanCheck({verifyBilling,transport,apiKey}={}){
 // Plan response alone cannot attest paid credits, auto-upgrade or payment settings.
 // verifyBilling must independently confirm those on the same authenticated account.
 const confirmFreePlan=async()=>{
  if(typeof verifyBilling!=='function'||typeof transport!=='function'||typeof apiKey!=='string'||!apiKey||apiKey.length>512||/[\r\n]/.test(apiKey))return false;
  try{
   if(await verifyBilling()!==true)return false;
   const res=await transport('https://api.brevo.com/v3/account',{method:'GET',redirect:'error',cache:'no-store',headers:{'api-key':apiKey,accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(res?.status!==200||res.redirected||!res.body||res.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return false;
   const reader=res.body.getReader(),chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){void reader.cancel();return false;}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return freeMailPlan(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{return false;}
 };
 return confirmFreePlan;
}
export function createBrevoFreeDispatcher({verifyBilling,transport,apiKey,...config}={}){
 // Override any caller-supplied confirmFreePlan with the actual composed check.
 return createMailDispatcher({...config,apiKey,transport,confirmFreePlan:createBrevoFreePlanCheck({verifyBilling,transport,apiKey})});
}
