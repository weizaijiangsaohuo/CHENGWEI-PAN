import {getCloudflareContext} from '@opennextjs/cloudflare';
import {createClient} from '@supabase/supabase-js';
import {sanitizeCountry,sanitizeSubdivision} from '@/lib/ip-region';

export const dynamic='force-dynamic';
const respond=(body:object,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});

/** Save only the country and CN province supplied by trusted Cloudflare metadata.
 * This endpoint never accepts an IP, a country, or province from the browser.
 * The Supabase rollout switch is off by default, allowing prior user notice.
 */
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin)return respond({error:'无效请求来源'},403);
 const bearer=/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')||'');
 if(!bearer)return respond({error:'请先登录'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return respond({error:'账号服务尚未配置'},503);
 try{
  const viewer=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:identity,error:identityError}=await viewer.auth.getUser(bearer[1]);
  if(identityError||!identity.user)return respond({error:'登录身份无效'},401);
  const {data:policy,error:policyError}=await viewer.from('sf_ip_region_policy')
   .select('enabled').eq('id',true).maybeSingle();
  // A database that hasn't installed the migration must never partially activate it.
  if(policyError||!policy?.enabled)return respond({enabled:false,saved:false,message:'IP 属地功能尚未启用'});
  const context=getCloudflareContext();
  const country=sanitizeCountry(context.cf?.country);
  const province=sanitizeSubdivision(country,context.cf?.regionCode);
  if(!country)return respond({enabled:true,saved:false,message:'当前网络归属地未知'},422);
  const secret=(context.env as unknown as Record<string,string|undefined>).SUPABASE_SERVICE_ROLE_KEY||
   process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)return respond({enabled:true,saved:false,error:'服务器尚未配置安全写入密钥'},503);
  const trusted=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:stored,error:writeError}=await trusted.rpc('sf_record_auto_ip_region',{
   p_user_id:identity.user.id,p_country_code:country,p_subdivision_code:province,
  });
  if(writeError)return respond({enabled:true,saved:false,error:'属地保存失败'},503);
  return respond({enabled:true,saved:stored===true});
 }catch{
  return respond({enabled:false,saved:false,error:'IP 属地服务暂时不可用'},503);
 }
}
