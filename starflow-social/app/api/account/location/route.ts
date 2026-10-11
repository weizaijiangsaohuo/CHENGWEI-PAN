import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const reply = (body:object,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

/** Server-only visitor country; never accept a location code or raw IP from client JSON.
 * Saving requires a Cloudflare runtime secret SUPABASE_SERVICE_ROLE_KEY; preview does not. It only stores
 * a coarse two-letter country code when the authenticated owner has opted in. */
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'请求来源无效。'},403);
  const match=/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')??'');
  if(!match)return reply({error:'请先登录。'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anon)return reply({error:'账号服务暂未配置。'},503);
  try{
    const viewer=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:identity,error:authError}=await viewer.auth.getUser(match[1]);
    if(authError||!identity.user)return reply({error:'登录身份已失效。'},401);
    const {data:settings,error:lookupError}=await viewer.from('account_ip_country')
      .select('is_public').eq('user_id',identity.user.id).maybeSingle();
    if(lookupError)return reply({error:'无法读取地区公开设置。'},503);
    if(!settings?.is_public)return reply({error:'请先开启国家／地区公开设置。'},403);

    // Cloudflare's request metadata is server generated, not client-submitted.
    const context=getCloudflareContext();
    const country=typeof context.cf?.country==='string'?context.cf.country.toUpperCase():'';
    if(!/^[A-Z]{2}$/.test(country)||['XX','ZZ','T1'].includes(country))
      return reply({error:'Cloudflare 本次未提供可用的国家／地区信息。'},422);

    // Preview is safe without a database admin secret: no row is written.
    const secret=(context.env as unknown as Record<string,string|undefined>).SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!secret)return reply({
      country_code:country,approximate:true,saved:false,
      message:'仅预览本次访问的大致地区，暂未保存到个人资料。服务器需完成安全配置后才能公开更新。',
    });
    const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:saved,error}=await admin.from('account_ip_country')
      .update({country_code:country,last_seen_at:new Date().toISOString()})
      .eq('user_id',identity.user.id).eq('is_public',true).select('user_id').maybeSingle();
    if(error||!saved)return reply({error:'地区资料暂时保存失败，请稍后再试。'},503);
    return reply({country_code:country,approximate:true,saved:true});
  }catch(e){console.error('account-location country lookup:',e instanceof Error?e.message:'unknown');return reply({error:'国家／地区识别暂不可用。'},503)}
}
