import type {ZeroPlan} from './starflow-zero-engine';

/** This is on-device procedural rendering, NOT AI diffusion/generative video.
 * Sources remain on the user's phone; no paid API, network or uploaded media.
 */
export type ZeroArtifact={blob:Blob;mime:string;extension:'png'|'mp4'|'webm'};
type Asset={image?:File|null;video?:File|null;signal?:AbortSignal;
 onProgress?:(value:number)=>void};
function assertNotAborted(signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException('已取消本地渲染','AbortError');
}
async function loadImage(file:File,signal?:AbortSignal):Promise<HTMLImageElement>{
 assertNotAborted(signal);
 const url=URL.createObjectURL(file),image=new Image();
 try{
  image.src=url;
  await new Promise<void>((resolve,reject)=>{
   const onAbort=()=>reject(new DOMException('已取消','AbortError'));
   const cleanup=()=>signal?.removeEventListener('abort',onAbort);
   image.onload=()=>{cleanup();resolve()};
   image.onerror=()=>{cleanup();reject(Error('无法读取所选图片'))};
   signal?.addEventListener('abort',onAbort,{once:true});
  });
  assertNotAborted(signal);
  return image;
 }finally{URL.revokeObjectURL(url)}
}
function rng(seed:number){
 let x=seed||1;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967295;}
}
function cover(ctx:CanvasRenderingContext2D,img:CanvasImageSource,
 iw:number,ih:number,w:number,h:number,scale=1,dx=0,dy=0){
 const k=Math.max(w/iw,h/ih)*scale;
 const cw=iw*k,ch=ih*k;
 ctx.drawImage(img,(w-cw)/2+dx,(h-ch)/2+dy,cw,ch);
}
function titleLines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number):string[]{
 const lines:string[]=[];let current='';
 for(const char of [...text]){
  if(ctx.measureText(current+char).width>maxWidth&&current){lines.push(current);current=char;}
  else current+=char;
  if(lines.length>=3)break;
 }
 if(current&&lines.length<4)lines.push(current);
 return lines.slice(0,4);
}
export function paintZeroFrame(ctx:CanvasRenderingContext2D,plan:ZeroPlan,
 frame:number,image?:HTMLImageElement,video?:HTMLVideoElement){
 const {width:w,height:h,palette,seed}=plan;
 const t=Math.max(0,Math.min(1,frame));
 const grad=ctx.createLinearGradient(0,0,w,h);
 grad.addColorStop(0,palette[0]);grad.addColorStop(.45,palette[1]);
 grad.addColorStop(1,palette[2]);
 ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
 const random=rng(seed);
 for(let i=0;i<46;i++){
  const x=random()*w,y=random()*h;
  const r=(6+random()*65)*(w/540);
  const movement=(Math.sin(t*Math.PI*2+i)*15)*(w/540);
  const glow=ctx.createRadialGradient(x+movement,y,0,x+movement,y,r);
  glow.addColorStop(0,i%3===0?palette[3]+'72':palette[2]+'40');
  glow.addColorStop(1,palette[0]+'00');
  ctx.fillStyle=glow;ctx.fillRect(x+movement-r,y-r,r*2,r*2);
 }
 if(image||video){
  ctx.save();
  ctx.globalAlpha=.98;
  if(video){
   ctx.filter=plan.style==='mono'?'grayscale(1) contrast(1.12)':
    plan.style==='warm'?'sepia(.22) saturate(1.23)':
    plan.style==='neon'?'saturate(1.5) contrast(1.15)':'contrast(1.06) saturate(1.06)';
   if(video.videoWidth&&video.videoHeight)
    cover(ctx,video,video.videoWidth,video.videoHeight,w,h,1.025);
  }else if(image){
   const scale=plan.motion==='zoom_out'?1.16-.11*t:1.04+.12*t;
   const dx=plan.motion==='pan_left'?-w*.075*t:plan.motion==='pan_right'?w*.075*t:
    Math.sin(t*3)*w*.006;
   const dy=plan.motion==='float'?Math.sin(t*Math.PI*2)*h*.01:0;
   cover(ctx,image,image.naturalWidth,image.naturalHeight,w,h,scale,dx,dy);
  }
  ctx.restore();
  // A subtle vignette creates legible titles over both user photos and video.
  const shade=ctx.createLinearGradient(0,0,0,h);
  shade.addColorStop(0,'rgba(8,7,23,.36)');
  shade.addColorStop(.4,'rgba(8,7,23,0)');
  shade.addColorStop(1,'rgba(8,7,23,.64)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
 }
 // Procedural geometry is intentional, never presented as an AI-generated scene.
 ctx.save();
 ctx.strokeStyle=palette[3]+'aa';ctx.lineWidth=Math.max(2,w/300);
 ctx.beginPath();ctx.arc(w*.5,h*.43,w*.23+(Math.sin(t*Math.PI*2)*w*.014),0,Math.PI*1.85);ctx.stroke();
 ctx.fillStyle='#ffffff';ctx.textAlign='center';
 const fs=Math.round(Math.max(23,Math.min(52,w*.063)));
 ctx.font='700 '+fs+'px system-ui, sans-serif';
 ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=14;
 const lines=titleLines(ctx,plan.title,w*.82),start=h*.69-(lines.length-1)*fs*.45;
 lines.forEach((line,i)=>ctx.fillText(line,w/2,start+i*fs*1.25));
 ctx.shadowBlur=0;
 ctx.font='600 '+Math.round(Math.max(11,w*.018))+'px system-ui, sans-serif';
 ctx.fillStyle=palette[3];ctx.fillText(plan.subtitle,w/2,h*.93);
 ctx.restore();
}
async function localVideo(file:File,signal?:AbortSignal){
 assertNotAborted(signal);
 const el=document.createElement('video');
 const url=URL.createObjectURL(file);
 el.src=url;el.muted=true;el.loop=true;el.playsInline=true;el.preload='auto';
 try{
  await new Promise<void>((resolve,reject)=>{
   const timeout=window.setTimeout(()=>{cleanup();reject(Error('读取视频超时'))},12000);
   const onAbort=()=>{cleanup();reject(new DOMException('已取消','AbortError'))};
   function cleanup(){window.clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);}
   el.onloadedmetadata=()=>{cleanup();resolve()};
   el.onerror=()=>{cleanup();reject(Error('此浏览器无法解码视频'))};
   signal?.addEventListener('abort',onAbort,{once:true});
   el.load();
  });
  if(!Number.isFinite(el.duration)||el.duration<=0||el.duration>60)
   throw Error('本地视频处理暂时支持 1～60 秒的视频素材');
  await el.play();
  return {element:el,release:()=>{
   el.pause();el.removeAttribute('src');el.load();URL.revokeObjectURL(url);
  }};
 }catch(e){el.pause();el.removeAttribute('src');URL.revokeObjectURL(url);throw e;}
}
const supportedType=()=>{
 if(typeof MediaRecorder==='undefined')return null;
 return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm']
  .find(type=>MediaRecorder.isTypeSupported(type))||null;
};
export async function renderZeroArtifact(plan:ZeroPlan,assets:Asset={}):Promise<ZeroArtifact>{
 assertNotAborted(assets.signal);
 const canvas=document.createElement('canvas');
 canvas.width=plan.width;canvas.height=plan.height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('设备无法创建 Canvas 绘图引擎');
 if(plan.mode==='image_motion'&&!assets.image)
  throw Error('请先选择用于运镜的视频参考图片');
 if(plan.mode==='video_grade'&&!assets.video)
  throw Error('请先上传需要本地调色的视频');
 let img:HTMLImageElement|undefined;let srcVideo:Awaited<ReturnType<typeof localVideo>>|undefined;
 try{
  if(assets.image&&(plan.mode==='poster'||plan.mode==='image_motion'))
   img=await loadImage(assets.image,assets.signal);
  if(plan.mode==='video_grade'&&assets.video)
   srcVideo=await localVideo(assets.video,assets.signal);
  paintZeroFrame(ctx,plan,0,img,srcVideo?.element);
  if(plan.mode==='poster'){
   assets.onProgress?.(100);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('PNG 导出失败，可能是内存不足');
   return {blob,mime:'image/png',extension:'png'};
  }
  if(typeof canvas.captureStream!=='function'||typeof MediaRecorder==='undefined')
   throw Error('此浏览器不支持 Canvas 视频录制，可先尝试免费 PNG 海报模式');
  const mime=supportedType();
  if(!mime)throw Error('此浏览器暂不支持 MP4/WebM 本地编码，请尝试另一浏览器');
  const stream=canvas.captureStream(plan.fps);
  let recorder:MediaRecorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000});}
  catch{stream.getTracks().forEach(track=>track.stop());throw Error('无法初始化本地视频编码器');}
  const chunks:BlobPart[]=[];
  const done=new Promise<Blob>((resolve,reject)=>{
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
   recorder.onerror=()=>reject(Error('本地视频编码中断'));
   recorder.onstop=()=>chunks.length?
    resolve(new Blob(chunks,{type:recorder.mimeType||mime})):
    reject(Error('视频编码未返回任何数据'));
  });
  let started=false;
  try{
   recorder.start(500);started=true;
   const startedAt=performance.now(),time=plan.duration*1000;
   await new Promise<void>((resolve,reject)=>{
    function step(now:number){
     if(assets.signal?.aborted){reject(new DOMException('已取消','AbortError'));return;}
     const progress=Math.min(1,(now-startedAt)/time);
     paintZeroFrame(ctx,plan,progress,img,srcVideo?.element);
     assets.onProgress?.(Math.min(99,Math.floor(progress*100)));
     if(progress>=1)resolve();
     else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
   });
   recorder.stop();
   const blob=await done;
   assets.onProgress?.(100);
   const actual=blob.type.includes('mp4')?'mp4':'webm';
   return {blob,mime:blob.type||mime,extension:actual};
  }catch(error){
   if(started&&recorder.state!=='inactive')recorder.stop();
   throw error;
  }finally{stream.getTracks().forEach(track=>track.stop());}
 }finally{srcVideo?.release();}
}
