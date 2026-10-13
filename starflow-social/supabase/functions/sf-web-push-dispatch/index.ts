// Private worker: encrypted VAPID Web Push transport; never invoked with a browser JWT.
// Enabled only after SF_PUSH_DISPATCH_TOKEN and both VAPID keys are securely configured.
// Edge Function config: verify_jwt=false; private secret header is REQUIRED on every POST.
import {createClient} from 'npm:@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

const encoder=new TextEncoder();
function sameSecret(actual:string,expected:string):boolean{
 const a=encoder.encode(actual),b=encoder.encode(expected);
 let different=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)different|=(a[i]??0)^(b[i]??0);
 return different===0;
}
function allowedGateway(endpoint:string):boolean{
 try{
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.pathname.startsWith('/'))return false;
  const h=url.hostname.toLowerCase();
  return h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'
   ||h==='android.googleapis.com'||(h.endsWith('.notify.windows.com')&&h.length<100);
 }catch{return false;}
}
type Work={delivery_id:string;endpoint:string;p256dh:string;auth_secret:string};
const response=(status:number,message:string)=>new Response(JSON.stringify({message}),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
Deno.serve(async (req:Request)=>{
 if(req.method!=='POST')return response(405,'Method not allowed');
 const expected=Deno.env.get('SF_PUSH_DISPATCH_TOKEN')||'';
 const actual=req.headers.get('x-starflow-dispatch-token')||'';
 if(expected.length<32)return response(503,'Push dispatcher is not configured');
 if(actual.length<32||!sameSecret(actual,expected))return response(401,'Unauthorized');
 const pub=Deno.env.get('SF_WEB_PUSH_VAPID_PUBLIC_KEY')||'';
 const priv=Deno.env.get('SF_WEB_PUSH_VAPID_PRIVATE_KEY')||'';
 const url=Deno.env.get('SUPABASE_URL')||'';
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!pub||!priv||!url||!service)return response(503,'Push delivery prerequisites are missing');
 // VAPID contact may be an HTTPS URL; never include personal addresses in push payloads.
 try{webpush.setVapidDetails('https://weizai.weizai.workers.dev',pub,priv);}
 catch{return response(503,'VAPID keys are invalid');}
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:jobs,error}=await db.rpc('sf_claim_web_push_deliveries',{p_limit:20});
 if(error)return response(503,'Could not lease push deliveries');
 let sent=0,expired=0,retry=0;
 for(const job of (jobs||[]) as Work[]){
  let status=503;
  if(allowedGateway(job.endpoint)){
   try{
    const result=await webpush.sendNotification(
     {endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth_secret}},
     JSON.stringify({type:'notification'}), // Generic marker only, never a private body.
     {TTL:3600,urgency:'normal'}
    );
    status=result.statusCode||201;
   }catch(e){
    // No URLs, keys, bearer tokens, user IDs, or notification contents in logs.
    const code=(e as {statusCode?:unknown}).statusCode;
    status=typeof code==='number'?code:503;
   }
  }else status=410;
  const {error:ackError}=await db.rpc('sf_finish_web_push_delivery',{
   p_id:job.delivery_id,p_status:status
  });
  if(ackError){retry++;continue;}
  if(status>=200&&status<300)sent++;
  else if(status===404||status===410)expired++;
  else retry++;
 }
 return new Response(JSON.stringify({claimed:(jobs||[]).length,sent,expired,retry}),{
  status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
 });
});
