// Public, read-only fail-closed probe of the named staging Worker.
// No secrets, no emails, no uploads, no user data, no production requests.
import {pathToFileURL} from 'node:url';
const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
const probes=['/api/v2/provider-readiness','/api/v2/readiness','/api/v2/registration-readiness'];
export async function probePublicPreviewDeny({fetchImpl=fetch}={}){
 const results=[];
 for(const path of probes){
  const name=path.split('/').at(-1);
  try{
   const response=await fetchImpl(origin+path,{method:'GET',redirect:'error',cache:'no-store',
    headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
   const denied=([403,404].includes(response?.status)&&!response.redirected);
   try{await response?.body?.cancel();}catch{/* Response body is never inspected. */}
   results.push({name,state:denied?'denied':'unexpected_status'});
  }catch{results.push({name,state:'unreachable'});}
 }
 return {state:results.every(r=>r.state==='denied')?'pass':'fail',probes:results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probePublicPreviewDeny();
 console.log(JSON.stringify(result));
 if(result.state!=='pass')process.exitCode=1;
}
