'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Clapperboard,Download,FileVideo,Film,Image as ImageIcon,
 LoaderCircle,RefreshCw,Sparkles,UploadCloud,WandSparkles} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';
import {creativeModeKeys,creativeModes} from '@/lib/creative-models';
import type {CreativeAspect,CreativeMode,CreativeStyle} from '@/lib/creative-models';
import './StarflowCreativeStudio.css';

type Job={id:string;mode:CreativeMode;prompt?:string;status:string;
 result_url?:string|null;error_message?:string|null;created_at?:string};
const styleOptions:{value:CreativeStyle;label:string;description:string}[]=[
 {value:'cinematic',label:'电影质感',description:'真实光影与流畅镜头'},
 {value:'portrait',label:'写真人像',description:'高级写真与细腻肤质'},
 {value:'anime',label:'动画电影',description:'精致角色与画面风格'},
 {value:'product',label:'商业大片',description:'品牌广告与摄影棚布光'}
];
const examples:Record<CreativeMode,string>={
 image:'雨后东京街头的电影级人像，蓝紫色霓虹，真实皮肤质感与自然光影',
 text_video:'雨后的城市夜景，镜头缓慢向前推进，玻璃反光与霓虹色彩流动',
 image_video:'人物缓缓回头微笑，发丝轻轻摆动，镜头自然靠近，脸部保持一致',
 motion:'让参考图片中的人物复刻参考视频的动作，保持人物外观与自然动作',
 edit_video:'保留原视频人物和动作，将场景调整为电影级夜景，优化光线与颜色'
};
const statusLabel:Record<string,string>={
 preparing:'正在提交',queued:'任务排队中',running:'AI 正在生成',completed:'生成完成',failed:'生成失败'
};
function authHeaders(token:string){return {Authorization:'Bearer '+token};}
export function StarflowCreativeStudio(){
 const [authenticated,setAuthenticated]=useState<boolean|null>(null);
 const [engineReady,setEngineReady]=useState<boolean|null>(null);
 const [mode,setMode]=useState<CreativeMode>('image_video');
 const [style,setStyle]=useState<CreativeStyle>('cinematic');
 const [aspect,setAspect]=useState<CreativeAspect>('9:16');
 const [duration,setDuration]=useState<5|10>(5);
 const [prompt,setPrompt]=useState('');
 const [image,setImage]=useState<File|null>(null);
 const [video,setVideo]=useState<File|null>(null);
 const [rights,setRights]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [jobs,setJobs]=useState<Job[]>([]);
 const [activeId,setActiveId]=useState<string|null>(null);
 const [imagePreview,setImagePreview]=useState('');
 const [videoPreview,setVideoPreview]=useState('');
 const spec=creativeModes[mode];
 const activeJob=jobs.find(job=>job.id===activeId);
 const hasActive=jobs.some(job=>['preparing','queued','running'].includes(job.status));
 const needsImage=spec.image;
 const needsVideo=spec.video;
 const usingImage=needsImage||(mode==='edit_video'&&!!image);
 const usingVideo=needsVideo;
 const needsRights=(usingImage&&!!image)||(usingVideo&&!!video);
 const canSubmit=!!prompt.trim()&&(!needsImage||!!image)&&(!needsVideo||!!video)&&
  (!needsRights||rights)&&!busy&&!hasActive&&authenticated===true&&engineReady===true;
 useEffect(()=>{
  if(!image){setImagePreview('');return;}
  const preview=URL.createObjectURL(image);setImagePreview(preview);
  return()=>URL.revokeObjectURL(preview);
 },[image]);
 useEffect(()=>{
  if(!video){setVideoPreview('');return;}
  const preview=URL.createObjectURL(video);setVideoPreview(preview);
  return()=>URL.revokeObjectURL(preview);
 },[video]);
 const getToken=useCallback(async()=>{
  const {data:{session}}=await db().auth.getSession();
  if(!session?.access_token)throw Error('请先登录星流');
  return session.access_token;
 },[]);
 const loadJobs=useCallback(async()=>{
  try{
   const token=await getToken();
   const res=await fetch('/api/creative',{headers:authHeaders(token),cache:'no-store'});
   const json=await res.json() as {jobs?:Job[];error?:string};
   if(!res.ok)throw Error(json.error||'读取创作记录失败');
   setJobs(json.jobs??[]);
  }catch(e){setError(e instanceof Error?e.message:'读取创作记录失败');}
 },[getToken]);
 const loadCapability=useCallback(async()=>{
  try{
   const token=await getToken();
   const response=await fetch('/api/creative?capability=1',{
    cache:'no-store',headers:authHeaders(token)});
   const info=await response.json() as {enabled?:boolean;error?:string};
   if(!response.ok)throw Error(info.error||'无法读取模型服务状态');
   setEngineReady(info.enabled===true);
  }catch{setEngineReady(false);}
 },[getToken]);
 const checkJob=useCallback(async(id:string)=>{
  const token=await getToken();
  const res=await fetch('/api/creative?id='+encodeURIComponent(id),{
   headers:authHeaders(token),cache:'no-store'});
  const json=await res.json() as {job?:Job;error?:string;warning?:string};
  if(!res.ok)throw Error(json.error||'无法同步生成任务');
  if(json.job){
   setJobs(previous=>previous.map(job=>job.id===id?{...job,...json.job}:job));
   if(json.job.status==='completed'||json.job.status==='failed')void loadJobs();
  }
  if(json.warning)setNotice(json.warning);
 },[getToken,loadJobs]);
 useEffect(()=>{
  let alive=true;
  if(!hasConfig()){setAuthenticated(false);return;}
  void db().auth.getUser().then(({data,error:e})=>{
   if(!alive)return;
   setAuthenticated(!e&&!!data.user);
   if(!e&&data.user){void loadJobs();void loadCapability();}
  }).catch(()=>{if(alive)setAuthenticated(false)});
  return()=>{alive=false};
 },[loadJobs,loadCapability]);
 useEffect(()=>{
  if(!authenticated||!hasActive)return;
  const id=jobs.find(job=>['preparing','queued','running'].includes(job.status))?.id;
  if(!id)return;
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')
   void checkJob(id).catch(e=>setNotice(e instanceof Error?e.message:'同步失败'));},6500);
  const resume=()=>{if(document.visibilityState==='visible')
   void checkJob(id).catch(()=>{})};
  document.addEventListener('visibilitychange',resume);
  return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',resume)};
 },[authenticated,hasActive,jobs,checkJob]);
 const updateImage=(file?:File)=>{
  if(!file){setImage(null);return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024||!file.size){
   setError('图片仅支持 JPG、PNG、WebP，且不能超过 8MB');return;}
  setError('');setImage(file);
 };
 const updateVideo=(file?:File)=>{
  if(!file){setVideo(null);return;}
  if(!['video/mp4','video/quicktime','video/webm'].includes(file.type)||file.size>50*1024*1024||!file.size){
   setError('视频仅支持 MP4、MOV、WebM，且不能超过 50MB');return;}
  setError('');setVideo(file);
 };
 async function upload(file:File,folder:'images'|'videos',userId:string){
  const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':
   file.type==='image/webp'?'webp':file.type==='video/quicktime'?'mov':
   file.type==='video/webm'?'webm':'mp4';
  const path=userId+'/'+folder+'/'+crypto.randomUUID()+'.'+ext;
  const {error:uploadError}=await db().storage.from('sf-creative-inputs')
   .upload(path,file,{upsert:false,cacheControl:'3600',contentType:file.type});
  if(uploadError)throw Error('素材上传失败：'+uploadError.message);
  return path;
 }
 async function submit(){
  if(!canSubmit||!authenticated)return;
  setBusy(true);setError('');setNotice('正在安全上传素材并提交任务…');
  try{
   const {data:{user}}=await db().auth.getUser();
   if(!user)throw Error('登录已失效');
   const token=await getToken();
   // Only reference inputs actually used by the selected model are uploaded.
   const imagePath=image&&usingImage?
    await upload(image,'images',user.id):null;
   const videoPath=video&&needsVideo?
    await upload(video,'videos',user.id):null;
   const response=await fetch('/api/creative',{method:'POST',cache:'no-store',
    headers:{...authHeaders(token),'Content-Type':'application/json'},
    body:JSON.stringify({mode,prompt,style,aspect,duration,imagePath,videoPath,rights})});
   const data=await response.json() as {jobId?:string;status?:string;error?:string};
   if(!response.ok||!data.jobId)throw Error(data.error||'生成请求失败');
   setActiveId(data.jobId);
   setJobs(previous=>[{id:data.jobId!,mode,prompt,status:'queued',
    created_at:new Date().toISOString()},...previous]);
   setNotice('已提交真实 AI 模型任务，请等待生成。离开页面后可在创作记录中查看。');
  }catch(e){
   setError(e instanceof Error?e.message:'生成任务未提交成功');
   setNotice('');
  }finally{setBusy(false);}
 }
 const visibleJobs=useMemo(()=>jobs.slice(0,20),[jobs]);
 return <main className="sf-creative-page">
  <div className="sf-creative-wrap">
   <header className="sf-creative-topbar">
    <Link href="/" aria-label="返回星流首页"><ArrowLeft size={21}/></Link>
    <span className="sf-creative-wordmark"><Sparkles size={20}/> STARFLOW <strong>AI STUDIO</strong></span>
    <Link href="/creator">创作者中心</Link>
   </header>
   <section className="sf-creative-hero">
    <div className="sf-creative-hero-spark"><WandSparkles size={30}/></div>
    <div><p className="sf-creative-eyebrow">STARFLOW · CREATIVE INTELLIGENCE</p>
     <h1>从一句灵感，到一段作品。</h1>
     <p>AI 图片、电影感视频、参考动作复刻、智能视频重塑。使用真实生成模型，尊重你的创作意图。</p>
    </div>
   </section>
   {authenticated===false&&<div className="sf-creative-notice" role="alert">
    创作工作室需要登录星流。<Link href="/">返回登录</Link></div>}
   {authenticated===true&&engineReady===false&&<div className="sf-creative-notice" role="status">
    AI 推理引擎尚未开通。页面和模型接口已开发，但在管理员配置付费模型和数据库前，
    不会收取费用，也不会伪造生成结果。
   </div>}
   <div className="sf-creative-layout">
    <section className="sf-creative-panel" aria-label="AI 创作设置">
     <div className="sf-creative-panel-title"><h2>选择创作方式</h2><span>01 / 模式</span></div>
     <div className="sf-creative-modes">
      {creativeModeKeys.map(key=><button type="button" key={key}
       aria-pressed={mode===key} className={mode===key?'active':''}
       onClick={()=>{setMode(key);setNotice('');setError('');}}>
       {key==='image'?<ImageIcon size={19}/>:key==='motion'?<Clapperboard size={19}/>:<Film size={19}/>}
       <strong>{creativeModes[key].label}</strong>
       <small>{creativeModes[key].hint}</small>
      </button>)}
     </div>
     <div className="sf-creative-panel-title"><h2>描述你的想法</h2><span>02 / 提示词</span></div>
     <label className="sf-creative-textarea"><span>一句话或详细描述都可以</span>
      <textarea maxLength={1800} rows={4} value={prompt}
       onChange={event=>setPrompt(event.target.value)}
       placeholder={examples[mode]} aria-label="AI 视频或图片生成描述"/>
      <small>{prompt.length}/1800 · 自动加入专业镜头与画质描述</small>
     </label>
     <button type="button" className="sf-creative-example"
      onClick={()=>setPrompt(examples[mode])}> <Sparkles size={15}/> 使用当前模式示例灵感</button>
     {(needsImage||mode==='edit_video')&&<div className="sf-creative-upload">
      <label><UploadCloud size={18}/> 参考图片 {needsImage?'（必需）':'（可选）'}
       <input type="file" accept="image/jpeg,image/png,image/webp"
        onChange={event=>updateImage(event.currentTarget.files?.[0])}/>
      </label>
      {imagePreview&&<div className="sf-creative-preview">
       <img src={imagePreview} alt="已选择的参考图片"/>
       <button type="button" onClick={()=>setImage(null)}>移除图片</button>
      </div>}
     </div>}
     {needsVideo&&<div className="sf-creative-upload">
      <label><FileVideo size={18}/> 参考视频（必需）
       <input type="file" accept="video/mp4,video/quicktime,video/webm"
        onChange={event=>updateVideo(event.currentTarget.files?.[0])}/>
      </label>
      {videoPreview&&<div className="sf-creative-preview">
       <video src={videoPreview} controls playsInline preload="metadata" aria-label="已选择的参考视频"/>
       <button type="button" onClick={()=>setVideo(null)}>移除视频</button>
      </div>}
      <small>{mode==='motion'?'请使用人物动作清晰的参考视频；视频朝向模式建议最长30秒。':
       '视频编辑模型建议使用 2～10 秒的视频片段。'}</small>
     </div>}
     <div className="sf-creative-panel-title"><h2>控制画面质感</h2><span>03 / 参数</span></div>
     <div className="sf-creative-style-grid">
      {styleOptions.map(item=><button key={item.value} type="button"
       className={style===item.value?'active':''} aria-pressed={style===item.value}
       onClick={()=>setStyle(item.value)}>
       <strong>{item.label}</strong><small>{item.description}</small>
      </button>)}
     </div>
     <div className="sf-creative-controls">
      <label>画面比例<select value={aspect}
       onChange={event=>setAspect(event.target.value as CreativeAspect)}>
       <option value="9:16">9:16 竖屏</option>
       <option value="16:9">16:9 横屏</option>
       <option value="1:1">1:1 方形</option>
      </select></label>
      {['text_video','image_video'].includes(mode)&&<label>视频时长<select value={duration}
       onChange={event=>setDuration(Number(event.target.value)===10?10:5)}>
       <option value={5}>5 秒</option><option value={10}>10 秒</option>
      </select></label>}
     </div>
     {needsRights&&<label className="sf-creative-rights">
      <input type="checkbox" checked={rights} onChange={event=>setRights(event.target.checked)}/>
      <span>我拥有这些图片、视频的使用权和出镜人物授权，同意将素材安全地发送给第三方 AI 模型处理。</span>
     </label>}
     <button type="button" className="sf-creative-generate" disabled={!canSubmit} onClick={()=>void submit()}>
      {busy?<LoaderCircle className="sf-creative-spin" size={19}/>:<WandSparkles size={20}/>}
      {busy?'正在提交模型任务…':'开始 AI 生成'}
     </button>
     {error&&<p role="alert" className="sf-creative-error">{error}</p>}
     {notice&&<p role="status" className="sf-creative-notice">{notice}</p>}
     <p className="sf-creative-fineprint">模型推理可能产生费用。平台未开放生成服务时会直接提示，不会扣除或伪造结果。生成质量、耗时和比例取决于模型。</p>
    </section>
    <aside className="sf-creative-results" aria-label="创作任务与作品">
     <div className="sf-creative-panel-title">
      <h2>我的生成作品</h2>
      <button type="button" onClick={()=>void loadJobs()} aria-label="刷新创作记录"><RefreshCw size={18}/></button>
     </div>
     <p className="sf-creative-side-hint">实时队列状态 · 仅本人可见的创作记录</p>
     {visibleJobs.length===0?<div className="sf-creative-empty">
       <Clapperboard size={40}/><h3>灵感即将成片</h3>
       <p>上传一张图片，写下镜头和动作，让 AI 帮你创造第一段作品。</p>
      </div>:visibleJobs.map(job=><article key={job.id} className="sf-creative-job">
       <div className="sf-creative-job-top">
        <strong>{creativeModes[job.mode]?.label||'AI 创作'}</strong>
        <span data-status={job.status}>{statusLabel[job.status]||job.status}</span>
       </div>
       {job.prompt&&<p>{job.prompt}</p>}
       {job.created_at&&<small>{new Date(job.created_at).toLocaleString('zh-CN')}</small>}
       {job.status==='completed'&&job.result_url&&(
        job.mode==='image'?<img src={job.result_url} alt="AI 生成的图片" loading="lazy"/>:
        <video src={job.result_url} controls playsInline preload="metadata" aria-label="AI 生成的视频"/>)}
       {job.status==='completed'&&job.result_url&&<a href={job.result_url} target="_blank"
        rel="noopener noreferrer"><Download size={16}/> 查看原文件 / 保存作品</a>}
       {['preparing','queued','running'].includes(job.status)&&<div className="sf-creative-progress" role="status">
        <LoaderCircle size={16} className="sf-creative-spin"/> AI 任务正在处理，请稍候
       </div>}
       {job.status==='failed'&&job.error_message&&<p className="sf-creative-error">{job.error_message}</p>}
      </article>)}
     <p className="sf-creative-fineprint">当前使用第三方模型生成。结果文件链接可能有保留期限，请及时保存；作品库永久保存与多镜头智能剪辑仍在后续规划中。</p>
    </aside>
   </div>
  </div>
 </main>;
}
