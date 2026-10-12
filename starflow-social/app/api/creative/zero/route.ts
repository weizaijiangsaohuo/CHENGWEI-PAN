import {makeZeroPlan,isZeroMode,ZERO_ENGINE_VERSION} from '@/lib/starflow-zero-engine';
export const dynamic='force-dynamic';
const json=(body:object,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
export async function GET(){
 return json({engine:ZERO_ENGINE_VERSION,cost:'0',paid:false,
  features:{
   poster:'本地程序化概念海报 PNG',
   text_motion:'本地程序化文字动效视频',
   image_motion:'用户图片运镜动效视频',
   video_grade:'已有视频的本地色彩处理（静音）'
  },
  limitations:'不是扩散模型：不具备生成真实人物视频、换脸或动作迁移能力；视频导出取决于浏览器支持。'});
}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)
   return json({error:'跨站请求已拒绝'},403);
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
   return json({error:'请发送 JSON 格式创作参数'},415);
  const text=await request.text();
  if(text.length>1200)return json({error:'请求参数过大'},413);
  const input=JSON.parse(text) as Record<string,unknown>;
  if(!isZeroMode(input.mode)||typeof input.prompt!=='string')
   return json({error:'无效创作模式或提示词'},400);
  const plan=makeZeroPlan({
   mode:input.mode,prompt:input.prompt,
   style:typeof input.style==='string'?input.style as 'cinematic'|'neon'|'warm'|'mono':undefined,
   aspect:typeof input.aspect==='string'?input.aspect as '9:16'|'16:9'|'1:1':undefined
  });
  return json({plan,cost:'0',paid:false,render:'on-device',provider:'Starflow Zero'});
 }catch(e){
  return json({error:e instanceof Error?e.message:'无法解析创作请求'},400);
 }
}
