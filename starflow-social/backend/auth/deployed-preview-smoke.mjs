// Read-only deployed preview probe. No signup, login, email, secret output or production traffic.
import {pathToFileURL} from 'node:url';
const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
const probes=['/api/v2/readiness','/api/v2/registration-readiness','/api/v2/provider-readiness'];
const statusCode=s=>[400,401,403,404,429,500,502,503,504].includes(s)?String(s):'unexpected';
export async function probeWorker({ownerKey,fetchImpl=fetch}={}){
 if(ownerKey===undefined||ownerKey==='')return {state:'not_configured',probes:[]};
 if(typeof ownerKey!=='string'||!/^[a-f0-9]{64}$/.test(ownerKey))return {state:'invalid_authorization',probes:[]};
 const results=[];
 for(const path of probes){
  const name=path===probes[0]?'auth_business':path===probes[1]?'registration':'providers';
  try{
   const response=await fetchImpl(origin+path,{method:'GET',redirect:'error',cache:'no-store',
    headers:{'x-starflow-preview-key':ownerKey,accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(response.redirected||response.status!==200){results.push({name,state:'http_'+statusCode(response.status)});continue;}
   if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!response.body){results.push({name,state:'invalid_response'});continue;}
   const reader=response.body.getReader(),chunks=[];let size=0,tooLarge=false;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){tooLarge=true;void reader.cancel().catch(()=>{});break;}chunks.push(value);}}finally{reader.releaseLock();}
   if(tooLarge){results.push({name,state:'invalid_response'});continue;}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
   if(name==='auth_business'){results.push({name,state:data?.ready===true?'ready':'not_ready'});continue;}
   if(name==='providers'){
    // Provider status is checked against fixed labels; never log API responses or secrets.
    const brevoAuthorized=data?.brevo==='free_account_authorized';
    const cloudinaryAuthorized=data?.cloudinary==='usage_access_authorized';
    results.push({name,state:brevoAuthorized&&cloudinaryAuthorized?'authorized':'unconfirmed',brevoAuthorized,cloudinaryAuthorized});
    continue;
   }
   if(data?.databaseReady!==true||typeof data.mailAdapterConfigured!=='boolean'||typeof data.liveMailVerified!=='boolean'||typeof data.registrationEnabled!=='boolean'){results.push({name,state:'not_ready'});continue;}
   results.push({name,state:'database_ready',mailAdapterConfigured:data.mailAdapterConfigured,liveMailVerified:data.liveMailVerified,registrationEnabled:data.registrationEnabled});
  }catch{results.push({name,state:'unreachable_or_invalid_response'});}
 }
 return {state:results[0]?.state==='ready'&&results[1]?.state==='database_ready'&&results[2]?.state==='authorized'?'database_ready':'not_ready',probes:results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probeWorker({ownerKey:process.env.STARFLOW_PREVIEW_OWNER_KEY});
 // Fixed classifications and booleans only. No response bodies, URLs with credentials or exceptions.
 console.log(JSON.stringify(result));
 if(result.state==='not_configured')console.log('::warning::Worker probe not run: existing preview authorization unavailable in GitHub Actions.');
 else if(result.state!=='database_ready')process.exitCode=1;
 else if(result.probes[1]?.liveMailVerified!==true)console.log('::warning::Database readiness does not establish real email delivery or registration success.');
}
