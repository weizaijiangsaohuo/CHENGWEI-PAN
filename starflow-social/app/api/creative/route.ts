import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {creativeInput,creativeModes,extractCreativeOutput,isCreativeMode,isCreativeStyle} from '@/lib/creative-models';
import type {CreativeAspect,CreativeMode,CreativeStyle} from '@/lib/creative-models';

export const dynamic='force-dynamic';
// Cannot be bypassed by Cloudflare configuration or a stored paid API key.
const STARFLOW_PAID_INFERENCE_LOCKED=true;
type Session={client:SupabaseClient;userId:string};
type Job={
 id:string;user_id:string;mode:CreativeMode;prompt:string;model_id:string;
 image_path:string|null;video_path:string|null;status:string;
 provider_request_id:string|null;result_url:string|null;error_message:string|null;
 created_at:string;updated_at:string;completed_at:string|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response=(data:object,status=200)=>Response.json(data,{status,headers:{
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function authenticated(request:Request):Promise<Session|Response>{
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return response({error:'无效请求来源'},403);
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return response({error:'请先登录星流'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return response({error:'账号服务未配置'},503);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+token}}});
 const {data,error}=await client.auth.getUser(token);
 if(error||!data.user)return response({error:'登录已过期，请重新登录'},401);
 return {client,userId:data.user.id};
}
function falUrl(model:string,id?:string,suffix=''){
 const allowed=Object.values(creativeModes).some(m=>m.model===model);
 if(!allowed)throw Error('不允许的生成模型');
 const root='https://queue.fal.run/'+model;
 return id?root+'/requests/'+encodeURIComponent(id)+suffix:root;
}
async function falFetch(url:string,method:'GET'|'POST',payload?:object){
 const key=process.env.FAL_KEY;
 if(!key)throw Error('未配置 AI 生成服务密钥');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),16000);
 try{
  const result=await fetch(url,{method,signal:controller.signal,cache:'no-store',
   headers:{Authorization:'Key '+key,...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  if(!result.ok)throw Error('AI 模型服务暂不可用（'+result.status+'）');
  return await result.json() as Record<string,unknown>;
 }finally{clearTimeout(timer);}
}
async function signedInput(session:Session,path:string|null,folder:'images'|'videos'){
 if(!path)return undefined;
 const safe=folder==='images'?/\.(png|jpg|jpeg|webp)$/i:/\.(mp4|mov|webm)$/i;
 if(!path.startsWith(session.userId+'/'+folder+'/')||
    !new RegExp('^[a-f0-9-]{36}/'+folder+'/[a-f0-9-]{36}\\.','i').test(path)||
    !safe.test(path))throw Error('参考素材路径无效');
 const {data,error}=await session.client.storage.from('sf-creative-inputs').createSignedUrl(path,60*60*6);
 if(error||!data?.signedUrl)throw Error('参考素材不存在或无法授权读取');
 return data.signedUrl;
}
async function failJob(session:Session,id:string,message:string){
 await session.client.from('sf_creative_jobs').update({
  status:'failed',error_message:message.slice(0,500),
  updated_at:new Date().toISOString(),completed_at:new Date().toISOString()
 }).eq('id',id).eq('user_id',session.userId);
}
export async function POST(request:Request){
 try{
  const auth=await authenticated(request);
  if(auth instanceof Response)return auth;
  if(STARFLOW_PAID_INFERENCE_LOCKED)
   return response({error:'星流目前只允许零预算自主创作；请使用 /api/creative/zero。'},403);
  if(process.env.STARFLOW_CREATIVE_ENABLED!=='true'||!process.env.FAL_KEY)
   return response({error:'AI 生成引擎尚未开通：需要平台管理员配置付费模型密钥与预算。'},503);
  const raw=await request.text();
  if(raw.length>6500)return response({error:'参数过长'},413);
  const body=JSON.parse(raw) as Record<string,unknown>;
  if(!isCreativeMode(body.mode)||!isCreativeStyle(body.style))
   return response({error:'不支持的创作类型或视觉风格'},400);
  const mode=body.mode;
  const spec=creativeModes[mode];
  const prompt=typeof body.prompt==='string'?body.prompt.trim():'';
  const imagePath=typeof body.imagePath==='string'?body.imagePath:null;
  const videoPath=typeof body.videoPath==='string'?body.videoPath:null;
  const aspect=['9:16','16:9','1:1'].includes(String(body.aspect))?body.aspect as CreativeAspect:'9:16';
  const duration:5|10=body.duration===10?10:5;
  if(!prompt||prompt.length>1800||/\p{Cc}/u.test(prompt))
   return response({error:'请填写不超过1800字的创作描述'},400);
  if((spec.image&&!imagePath)||(spec.video&&!videoPath))
   return response({error:'请上传这个模式所需的参考图片或视频'},400);
  if((imagePath||videoPath)&&body.rights!==true)
   return response({error:'请确认你拥有参考素材使用权及人物授权'},400);
  const imageUrl=await signedInput(auth,imagePath,'images');
  const videoUrl=await signedInput(auth,videoPath,'videos');
  const {data:jobId,error:claimError}=await auth.client.rpc('sf_creative_claim',{
   p_mode:mode,p_prompt:prompt,p_image_path:imagePath,p_video_path:videoPath,
   p_aspect_ratio:aspect,p_duration:duration,p_model_id:spec.model
  });
  if(claimError||typeof jobId!=='string')
   return response({error:claimError?.message||'创作配额服务暂不可用，请确认数据库已部署'},429);
  try{
   const input=creativeInput(mode,prompt,body.style as CreativeStyle,aspect,duration,imageUrl,videoUrl);
   const submission=await falFetch(falUrl(spec.model),'POST',input);
   const requestId=submission.request_id;
   if(typeof requestId!=='string'||!UUID.test(requestId))throw Error('生成服务未返回有效任务编号');
   const {error:storeError}=await auth.client.from('sf_creative_jobs').update({
    provider_request_id:requestId,status:'queued',updated_at:new Date().toISOString()
   }).eq('id',jobId).eq('user_id',auth.userId);
   if(storeError)throw Error('保存生成任务失败，请联系平台支持');
   return response({jobId,status:'queued'},202);
  }catch(error){
   const message=error instanceof Error?error.message:'生成引擎暂不可用';
   await failJob(auth,jobId,message);
   return response({error:message,jobId},503);
  }
 }catch(error){
  return response({error:error instanceof SyntaxError?'无效请求参数':
   error instanceof Error?error.message:'创作服务暂不可用'},400);
 }
}
export async function GET(request:Request){
 try{
  const auth=await authenticated(request);
  if(auth instanceof Response)return auth;
  const params=new URL(request.url).searchParams;
  if(params.get('capability')==='1'){
   return response({enabled:!STARFLOW_PAID_INFERENCE_LOCKED&&process.env.STARFLOW_CREATIVE_ENABLED==='true'&&!!process.env.FAL_KEY});
  }
  const id=params.get('id');
  if(!id){
   const {data,error}=await auth.client.from('sf_creative_jobs')
    .select('id,mode,prompt,status,result_url,error_message,created_at,completed_at')
    .eq('user_id',auth.userId).order('created_at',{ascending:false}).limit(30);
   if(error)return response({error:'无法读取个人创作记录'},503);
   return response({jobs:data||[]});
  }
  if(!UUID.test(id))return response({error:'创作任务编号无效'},400);
  const {data,error}=await auth.client.from('sf_creative_jobs').select('*')
   .eq('id',id).eq('user_id',auth.userId).maybeSingle();
  if(error)return response({error:'任务暂时无法读取'},503);
  if(!data)return response({error:'找不到该创作任务'},404);
  const job=data as Job;
  if(STARFLOW_PAID_INFERENCE_LOCKED)
   return response({job:{id:job.id,mode:job.mode,status:job.status,
    result_url:job.status==='completed'?job.result_url:null,
    error_message:job.error_message},
    warning:'星流零预算模式已停止所有第三方付费模型同步。'});
  // Release abandoned provider tasks instead of blocking the user's daily
  // single-flight slot indefinitely. Keep the already-incurred quota visible.
  if(['queued','running'].includes(job.status)&&
     Date.now()-new Date(job.created_at).getTime()>6*60*60*1000){
   await failJob(auth,job.id,'生成任务超过6小时未完成，请联系平台支持');
   return response({job:{id:job.id,mode:job.mode,status:'failed',
    error_message:'生成任务超时，请联系平台支持'}});
  }
  if(job.status==='completed'||job.status==='failed')
   return response({job:{id:job.id,mode:job.mode,status:job.status,result_url:job.result_url,error_message:job.error_message}});
  if(job.status==='preparing'){
   if(Date.now()-new Date(job.created_at).getTime()>10*60*1000){
    await failJob(auth,job.id,'任务提交超时，请重新生成');
    return response({job:{id:job.id,mode:job.mode,status:'failed',error_message:'任务提交超时'}});
   }
   return response({job:{id:job.id,mode:job.mode,status:'preparing'}});
  }
  if(!job.provider_request_id||!UUID.test(job.provider_request_id)||
     !Object.values(creativeModes).some(m=>m.model===job.model_id))
   return response({error:'任务状态异常'},503);
  if(!process.env.FAL_KEY)
   return response({job:{id:job.id,mode:job.mode,status:job.status,
    error_message:'管理员尚未配置生成服务，暂时不能同步任务'}});
  try{
   const status=await falFetch(falUrl(job.model_id,job.provider_request_id,'/status'),'GET');
   const state=status.status;
   if(state==='IN_QUEUE'||state==='IN_PROGRESS'){
    const next=state==='IN_PROGRESS'?'running':'queued';
    if(next!==job.status)await auth.client.from('sf_creative_jobs')
     .update({status:next,updated_at:new Date().toISOString()})
     .eq('id',job.id).eq('user_id',auth.userId);
    return response({job:{id:job.id,mode:job.mode,status:next}});
   }
   if(state==='FAILED'||state==='CANCELLED'){
    await failJob(auth,job.id,'生成引擎未能完成任务');
    return response({job:{id:job.id,mode:job.mode,status:'failed',
     error_message:'生成引擎未能完成任务'}});
   }
   if(state!=='COMPLETED')return response({job:{id:job.id,mode:job.mode,status:job.status}});
   const output=await falFetch(falUrl(job.model_id,job.provider_request_id),'GET');
   const media=extractCreativeOutput(output,creativeModes[job.mode].kind);
   if(!media)throw Error('模型已完成，但未返回有效媒体文件');
   const {error:storeError}=await auth.client.from('sf_creative_jobs').update({
    status:'completed',result_url:media,updated_at:new Date().toISOString(),
    completed_at:new Date().toISOString()
   }).eq('id',job.id).eq('user_id',auth.userId);
   if(storeError)throw Error('无法保存任务结果');
   return response({job:{id:job.id,mode:job.mode,status:'completed',result_url:media}});
  }catch(error){
   // Provider/network outages must not mark paid inference as failed.
   return response({job:{id:job.id,mode:job.mode,status:job.status},
    warning:error instanceof Error?error.message:'AI 任务同步暂时不可用'});
  }
 }catch{
  return response({error:'创作任务同步失败'},503);
 }
}
