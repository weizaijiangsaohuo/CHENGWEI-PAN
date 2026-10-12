import {getCloudflareContext} from '@opennextjs/cloudflare';
import {createClient} from '@supabase/supabase-js';

export const dynamic='force-dynamic';
type RateLimiter={limit:(args:{key:string})=>Promise<{success:boolean}>};
type Whisper={run:(model:string,args:{audio:string;task:'transcribe';language?:string;vad_filter:boolean})=>Promise<{text?:string}>};
type Bindings={AI?:Whisper;SUPPORT_PER_IP?:RateLimiter;SUPPORT_GLOBAL?:RateLimiter};
const json=(value:object,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const MAX_BYTES=6*1024*1024;
const ALLOWED=new Set(['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/aac','audio/x-m4a']);
export async function POST(request:Request){
 try{
  // Audio remains ephemeral: no public upload, stored transcript, or log containing speech.
  if(request.headers.get('origin')!==new URL(request.url).origin)
   return json({error:'请求来源无效'},403);
  const auth=request.headers.get('authorization');
  if(!auth?.startsWith('Bearer '))return json({error:'请先登录星流'},401);
  const inputType=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!ALLOWED.has(inputType))return json({error:'不支持此音频编码，请尝试 MP4、WebM、MP3 或 WAV。'},415);
  const size=Number(request.headers.get('content-length')||'0');
  if(size>MAX_BYTES)return json({error:'录音超过6MB，请缩短录音时间。'},413);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return json({error:'账号系统未配置'},503);
  const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await client.auth.getUser(auth.slice(7));
  if(error||!data.user)return json({error:'登录状态失效，请重新登录'},401);
  const {env}=getCloudflareContext();
  const bindings=env as unknown as Bindings;
  if(!bindings.AI||!bindings.SUPPORT_PER_IP||!bindings.SUPPORT_GLOBAL)
   return json({error:'语音转文字服务尚未就绪'},503);
  const [personal,global]=await Promise.all([
   bindings.SUPPORT_PER_IP.limit({key:'transcribe:'+data.user.id}),
   bindings.SUPPORT_GLOBAL.limit({key:'transcribe:global'})
  ]);
  if(!personal.success||!global.success)return json({error:'转写次数过多，请稍后再试'},429);
  const buffer=await request.arrayBuffer();
  if(buffer.byteLength<100||buffer.byteLength>MAX_BYTES)return json({error:'音频太短或文件太大'},413);
  // Omit the language hint for automatic language detection (Whisper supports
  // it). Never force Chinese for Japanese, Korean, French or mixed speech.
  const requestedLanguage=(request.headers.get('x-sf-speech-language')||'auto').toLowerCase();
  const allowedLanguages=new Set(['auto','zh','en','ja','ko','fr','de','es','it','pt','ru']);
  if(!allowedLanguages.has(requestedLanguage))return json({error:'不支持此语音识别语言'},400);
  const language=requestedLanguage==='auto'?undefined:requestedLanguage;
  const base64=Buffer.from(buffer).toString('base64');
  try{
   const result=await bindings.AI.run('@cf/openai/whisper-large-v3-turbo',
    {audio:base64,task:'transcribe',...(language?{language}:{}),vad_filter:true});
   const transcript=(result.text||'').trim().slice(0,2000);
   if(!transcript)return json({error:'没有识别到清晰的人声，请重试或使用键盘语音输入'},422);
   return json({text:transcript});
  }catch{
   return json({error:'AI 语音识别暂时不可用，请稍后重试或使用系统键盘听写'},503);
  }
 }catch{
  return json({error:'语音转文字请求失败，请稍后重试'},503);
 }
}
