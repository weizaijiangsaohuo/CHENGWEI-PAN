import {createClient,type SupabaseClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
type Session={client:SupabaseClient;userId:string};
// Legacy paid inference permanently retired. Existing job history remains read-only.
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

export async function POST(){
 return response({error:'第三方付费创作服务已永久停用；请使用 /api/creative/zero。'},410);
}
export async function GET(request:Request){
 try{
  const auth=await authenticated(request);
  if(auth instanceof Response)return auth;
  const params=new URL(request.url).searchParams;
  if(params.get('capability')==='1')return response({enabled:false});
  const id=params.get('id');
  const query=auth.client.from('sf_creative_jobs')
   .select('id,mode,prompt,status,result_url,error_message,created_at,completed_at').eq('user_id',auth.userId);
  if(!id){
   const {data,error}=await query.order('created_at',{ascending:false}).limit(30);
   if(error)return response({error:'无法读取个人创作记录'},503);
   return response({jobs:data||[]});
  }
  if(!UUID.test(id))return response({error:'创作任务编号无效'},400);
  const {data,error}=await query.eq('id',id).maybeSingle();
  if(error)return response({error:'任务暂时无法读取'},503);
  if(!data)return response({error:'找不到该创作任务'},404);
  return response({job:{id:data.id,mode:data.mode,status:data.status,
   result_url:data.status==='completed'?data.result_url:null,error_message:data.error_message},
   warning:'星流零预算模式已停止所有第三方付费模型同步。'});
 }catch{return response({error:'创作任务读取失败'},503);}
}
