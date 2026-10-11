import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const reply = (body:object,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

/** Server-only visitor country; never accept a location code or raw IP from client JSON.
 * This route requires a Cloudflare secret SUPABASE_SERVICE_ROLE_KEY, and only stores
 * a coarse two-letter country code when the authenticated owner has opted in. */
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'请求来源无效。'},403);
  const match=/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')??'');
  if(!match)return reply({error:'请先登录。'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anon)return reply({error:'账号服务暂未配置。'},503);
  try{
    const context=getCloudflareContext();
    const secret=(context.env as unknown as Record<string,string|undefined>).SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!secret)return reply({error:'国家／地区服务尚未启用：服务器需配置 SUPABASE_SERVICE_ROLE_KEY。'},503);
    const country=typeof context.cf?.country==='string'?context.cf.country.toUpperCase():'';
    if(!/^[A-Z]{2}$/.test(country)||['XX','ZZ','T1'].includes(country))
      return reply({error:'Cloudflare 目前无法从本次访问获取有效国家／地区。'},422);
    const viewer=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:identity,error:authError}=await viewer.auth.getUser(match[1]);
    if(authError||!identity.user)return reply({error:'登录身份已失效。'},401);
    const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:settings,error:lookupError}=await admin.from('account_ip_country').select('is_public').eq('user_id',identity.user.id).maybeSingle();
    if(lookupError)return reply({error:'无法读取地区公开设置。'},503);
    if(!settings?.is_public)return reply({error:'请先开启国家／地区公开设置。'},403);
    const {error}=await admin.from('account_ip_country').update({country_code:country,last_seen_at:new Date().toISOString()}).eq('user_id',identity.user.id);
    if(error)return reply({error:'地区信息暂时保存失败。'},503);
    return reply({country_code:country,approximate:true});
  }catch(e){console.error('account-location country lookup:',e instanceof Error?e.message:'unknown');return reply({error:'国家／地区识别暂不可用。'},503)}
}
