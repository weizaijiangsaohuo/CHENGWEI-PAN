// Read-only online acceptance of the existing named preview. No deployment or secret output.
import {pathToFileURL} from 'node:url';
export const origin='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev';
const protectedPaths=['/api/v2/me','/api/v2/messages','/api/v2/notifications','/api/v2/posts','/api/v2/inbox-preview','/api/identity/auth/get-session'];
const failure=code=>({accepted:false,code});
export async function verifyPreview({fetcher=globalThis.fetch,ownerKey}={}){
 if(ownerKey!==undefined&&(typeof ownerKey!=='string'||!/^[a-f0-9]{64}$/.test(ownerKey)))return failure('invalid_owner_key');
 const read=async(path,headers={})=>fetcher(origin+path,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000),headers:{accept:'application/json',...headers}});
 const isPrivate=r=>/\bno-store\b/i.test(r.headers.get('cache-control')??'');
 try{
  for(const path of protectedPaths){
   const r=await read(path);
   if(r.status!==404||r.redirected||!isPrivate(r)||(await r.json())?.error!=='not_permitted')return failure('disabled_route_not_verified');
  }
  const publicReady=await read('/api/v2/readiness');
  if(publicReady.status!==403||publicReady.redirected||!isPrivate(publicReady)||(await publicReady.json())?.error!=='not_permitted')return failure('owner_gate_not_verified');
  if(ownerKey===undefined)return {accepted:false,code:'public_guards_verified_owner_readiness_required'};
  const r=await read('/api/v2/readiness',{'x-starflow-preview-key':ownerKey});
  if(r.status!==200||r.redirected||!isPrivate(r)||(await r.json())?.ready!==true)return failure('owner_readiness_not_verified');
  return {accepted:true,code:'disabled_preview_connectivity_verified'};
 }catch{return failure('network_or_response_unverified');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await verifyPreview({ownerKey:process.env.STARFLOW_PREVIEW_OWNER_KEY});
 console.log(result.code);
 if(!result.accepted)process.exitCode=1;
}
