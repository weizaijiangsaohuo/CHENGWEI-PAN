'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Clapperboard,Download,Image as ImageIcon,Film,
 LoaderCircle,ShieldCheck,Sparkles,UploadCloud,WandSparkles} from 'lucide-react';
import type {ZeroAspect,ZeroMode,ZeroPlan,ZeroStyle} from '@/lib/starflow-zero-engine';
import {renderZeroArtifact} from '@/lib/starflow-zero-renderer';
import type {ZeroTransition} from '@/lib/starflow-zero-timeline';
import './StarflowCreativeStudio.css';

const modes:{key:ZeroMode;title:string;description:string;image:boolean;video:boolean}[]=[
 {key:'poster',title:'概念海报 PNG',description:'文字驱动的程序化设计，可叠加本人照片',image:false,video:false},
 {key:'text_motion',title:'文字动效视频',description:'由星流本地引擎绘制动态背景与文字',image:false,video:false},
 {key:'image_motion',title:'图片运镜视频',description:'上传人物照片，生成真实可播放的推拉摇移短片',image:true,video:false},
 {key:'video_grade',title:'视频本地调色',description:'在本机对上传的视频进行色彩风格化（暂不保留声音）',image:false,video:true},
];
const styleNames:{key:ZeroStyle;title:string}[]=[
 {key:'cinematic',title:'电影蓝紫'},
 {key:'neon',title:'赛博霓虹'},
 {key:'warm',title:'温暖胶片'},
 {key:'mono',title:'黑白影调'},
];
const examples:Record<ZeroMode,string>={
 poster:'一张关于星空和城市未来的高级电影海报',
 text_motion:'霓虹灯雨夜，镜头缓慢靠近，星流两个字渐渐出现',
 image_motion:'将这张照片做成电影短片，镜头缓慢拉远',
 video_grade:'把这段视频处理成具有霓虹氛围的电影画面'
};
type DownloadResult={url:string;filename:string;mime:string;mode:ZeroMode};
export function StarflowZeroStudio(){
 const [mode,setMode]=useState<ZeroMode>('image_motion');
 const [style,setStyle]=useState<ZeroStyle>('cinematic');
 const [aspect,setAspect]=useState<ZeroAspect>('9:16');
 const [prompt,setPrompt]=useState('');
 const [image,setImage]=useState<File|null>(null);
 const [photoFiles,setPhotoFiles]=useState<File[]>([]);
 const [transition,setTransition]=useState<ZeroTransition>('crossfade');
 const [trimStart,setTrimStart]=useState(0);
 const [videoDuration,setVideoDuration]=useState(0);
 const [subtitle,setSubtitle]=useState('');
 const [subtitleFrom,setSubtitleFrom]=useState(0);
 const [subtitleTo,setSubtitleTo]=useState(5);
 const [showTitle,setShowTitle]=useState(true);
 const [video,setVideo]=useState<File|null>(null);
 const [imagePreview,setImagePreview]=useState('');
 const [videoPreview,setVideoPreview]=useState('');
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState(0);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [result,setResult]=useState<DownloadResult|null>(null);
 const [lastPlan,setLastPlan]=useState<ZeroPlan|null>(null);
 const resultUrl=useRef<string|null>(null);
 const abort=useRef<AbortController|null>(null);
 const spec=modes.find(item=>item.key===mode)!;
 const canSubmit=prompt.trim().length>0&&(!spec.image||photoFiles.length>0)&&
  (!spec.video||!!video)&&!busy;
 useEffect(()=>{
  if(!image){setImagePreview('');return;}
  const url=URL.createObjectURL(image);setImagePreview(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 useEffect(()=>{
  if(!video){setVideoPreview('');return;}
  const url=URL.createObjectURL(video);setVideoPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[video]);
 useEffect(()=>()=>{
  abort.current?.abort();
  if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);
 },[]);
 function selectImages(files:FileList|null){
  const chosen=Array.from(files||[]).slice(0,3);
  if(!chosen.length){setPhotoFiles([]);setImage(null);return;}
  if(chosen.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||
     file.size>8*1024*1024||!file.size)){
   setError('仅支持 JPG、PNG、WebP，每张不超过 8MB。');return;
  }
  setPhotoFiles(chosen);setImage(chosen[0]);setError('');
 }
 function selectImage(file?:File){
  if(!file){setImage(null);setPhotoFiles([]);return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024||!file.size){
   setError('图片只支持 JPG、PNG、WebP，大小不超过 8MB。');return;}
  setPhotoFiles([file]);setImage(file);setError('');
 }
 function selectVideo(file?:File){
  if(!file){setVideo(null);return;}
  if(!['video/mp4','video/quicktime','video/webm'].includes(file.type)||file.size>40*1024*1024||!file.size){
   setError('视频只支持 MP4、MOV、WebM，大小不超过 40MB。');return;}
  setVideo(file);setTrimStart(0);setVideoDuration(0);setError('');
 }
 async function create(){
  if(!canSubmit)return;
  setBusy(true);setError('');setNotice('正在调用星流自研场景规划 API…');setProgress(0);
  const controller=new AbortController();abort.current=controller;
  try{
   const response=await fetch('/api/creative/zero',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode,style,aspect,prompt}),signal:controller.signal,
    cache:'no-store'
   });
   const body=await response.json() as {plan?:ZeroPlan;error?:string};
   if(!response.ok||!body.plan)throw Error(body.error||'场景规划 API 暂不可用');
   if(controller.signal.aborted)return;
   setLastPlan(body.plan);
   setNotice('场景规划完成。现在使用你的设备本地渲染，不上传原始素材。');
   const artifact=await renderZeroArtifact(body.plan,{
    image:spec.image||mode==='poster'?image:null,
    images:mode==='image_motion'?photoFiles:undefined,
    video:spec.video?video:null,
    timeline:{imageCount:photoFiles.length||1,transition,trimStart,
     subtitle,subtitleFrom,subtitleTo,showTitle},
    signal:controller.signal,onProgress:setProgress
   });
   if(controller.signal.aborted)return;
   if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);
   const url=URL.createObjectURL(artifact.blob);resultUrl.current=url;
   const filename='starflow-zero-'+Date.now()+'.'+artifact.extension;
   setResult({url,filename,mime:artifact.mime,mode});
   setNotice('本地作品已生成。点击下方“保存作品”即可保存到手机。');
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'本地渲染失败');
  }finally{
   if(abort.current===controller)abort.current=null;
   setBusy(false);
  }
 }
 function stop(){abort.current?.abort();setBusy(false);setNotice('本次本地任务已取消。');}
 return <main className="sf-creative-page sf-zero-page">
  <div className="sf-creative-wrap">
   <header className="sf-creative-topbar">
    <Link href="/" aria-label="返回星流首页"><ArrowLeft size={21}/></Link>
    <span className="sf-creative-wordmark"><Sparkles size={20}/> STARFLOW <strong>ZERO ENGINE</strong></span>
    <Link href="/creator">创作者中心</Link>
   </header>
   <section className="sf-creative-hero">
    <div className="sf-creative-hero-spark"><WandSparkles size={30}/></div>
    <div>
     <p className="sf-creative-eyebrow">STARFLOW ZERO · SELF-DEVELOPED API</p>
     <h1>零预算，自主开始创作。</h1>
     <p>星流自研场景规划与设备端渲染。无需会员、付费 API 或 GPU。可生成真实 PNG 与浏览器支持的视频文件。</p>
    </div>
   </section>
   <div className="sf-zero-honest" role="note">
    <ShieldCheck size={20}/>
    <span><strong>完全零付费推理</strong> · 当前版本使用程序化绘图、图片运镜和基础视频调色。
     <b>不是扩散式 AI 生图/文生真人视频模型。</b> 真实人物动作迁移、视频复刻、复杂 AI 剪辑仍在自主研发中。</span>
   </div>
   <div className="sf-creative-notice" role="note">
    <strong>更多免费本地剪辑：</strong>{' '}
    <Link href="/starflow-video-editor.html">打开免费视频工作台</Link>
    {' '}— 支持自选裁剪时长、变速、滤镜、字幕和设备兼容时的高清导出。
    这是浏览器传统视频处理，不是文生视频大模型。
   </div>
   <div className="sf-creative-layout">
    <section className="sf-creative-panel" aria-label="星流本地创作引擎">
     <div className="sf-creative-panel-title"><h2>选择免费创作能力</h2><span>01 / 引擎</span></div>
     <div className="sf-creative-modes">
      {modes.map(item=><button type="button" key={item.key}
       className={mode===item.key?'active':''} aria-pressed={mode===item.key}
       onClick={()=>{setMode(item.key);setError('');setNotice('');}}>
       {item.key==='poster'?<ImageIcon size={19}/>:item.key==='video_grade'?<Clapperboard size={19}/>:<Film size={19}/>}
       <strong>{item.title}</strong><small>{item.description}</small>
      </button>)}
     </div>
     <div className="sf-zero-upcoming">
      <strong>研发中的核心 AI：</strong>人物动作复刻 · 自研视频扩散模型 · 一句话生成写实视频 · 智能多轨剪辑
     </div>
     <div className="sf-creative-panel-title"><h2>用一句话描述画面</h2><span>02 / 场景</span></div>
     <label className="sf-creative-textarea"><span>输入画面、运镜与风格偏好</span>
      <textarea rows={4} maxLength={240} value={prompt}
       onChange={e=>setPrompt(e.target.value)}
       placeholder={examples[mode]} aria-label="本地画面与运镜描述"/>
      <small>{prompt.length}/240 字 · 当前为规则式解析，不是大模型理解</small>
     </label>
     <button type="button" className="sf-creative-example"
      onClick={()=>setPrompt(examples[mode])}><Sparkles size={16}/> 填入创作示例</button>
     {(spec.image||mode==='poster')&&<div className="sf-creative-upload">
      <label><UploadCloud size={18}/> {spec.image?'选择 1～3 张图片（按照选择顺序播放）':'选择设备中的图片（可选）'}
       <input type="file" accept="image/png,image/jpeg,image/webp"
        multiple={mode==='image_motion'}
        onChange={e=>mode==='image_motion'?selectImages(e.currentTarget.files):selectImage(e.currentTarget.files?.[0])}/>
      </label>
      {imagePreview&&<div className="sf-creative-preview">
       <img src={imagePreview} alt="设备本地参考图片"/>
       <button type="button" onClick={()=>{setImage(null);setPhotoFiles([]);}}>移除图片</button>
      </div>}
      {spec.image&&photoFiles.length>0&&<div className="sf-zero-shot-list">
       <strong>镜头顺序</strong>
       {photoFiles.map((file,i)=><span key={i}>镜头 {i+1}：{file.name}</span>)}
       <small>最多 3 张；每张依次展示，不会改变原始照片。</small>
      </div>}
     </div>}
     {spec.video&&<div className="sf-creative-upload">
      <label><UploadCloud size={18}/> 上传设备视频（必需，最多60秒）
       <input type="file" accept="video/mp4,video/quicktime,video/webm"
        onChange={e=>selectVideo(e.currentTarget.files?.[0])}/>
      </label>
      {videoPreview&&<div className="sf-creative-preview">
       <video src={videoPreview} controls playsInline preload="metadata" aria-label="设备本地参考视频"
        onLoadedMetadata={event=>{
         const seconds=event.currentTarget.duration;
         setVideoDuration(Number.isFinite(seconds)?seconds:0);
        }}/>
       <button type="button" onClick={()=>setVideo(null)}>移除视频</button>
      </div>}
      <small>本地导出 5 秒，可选择开始时间；不足 5 秒时可能循环播放，暂不包含原始音轨。</small>
      {videoDuration>0&&<div className="sf-zero-timeline">
       <label htmlFor="sf-zero-trim">裁剪开始时间：{trimStart.toFixed(1)} 秒</label>
       <input id="sf-zero-trim" type="range" min={0}
        max={Math.max(0,Math.floor((videoDuration-5)*10)/10)}
        step="0.1" value={trimStart}
        disabled={videoDuration<=5}
        onChange={event=>setTrimStart(Number(event.target.value))}/>
       <small>原片 {videoDuration.toFixed(1)} 秒 · 输出从 {trimStart.toFixed(1)} 秒开始的 5 秒画面</small>
      </div>}
     </div>}
     <div className="sf-creative-panel-title"><h2>字幕与剪辑时间轴</h2><span>03 / 编辑</span></div>
     <div className="sf-zero-timeline">
      {mode==='image_motion'&&<label>镜头之间的转场
       <select value={transition} onChange={event=>setTransition(event.target.value as ZeroTransition)}>
        <option value="crossfade">柔和交叉淡化</option>
        <option value="cut">直接切换镜头</option>
       </select>
      </label>}
      <label htmlFor="sf-zero-caption">叠加字幕（最多80字）</label>
      <input id="sf-zero-caption" type="text" maxLength={80}
       value={subtitle} onChange={event=>setSubtitle(event.target.value)}
       placeholder="例如：这一刻，时间仿佛停止。"/>
      <div className="sf-zero-time-fields">
       <label>字幕开始（秒）<input type="number" min="0" max="5" step=".5"
        value={subtitleFrom} onChange={event=>{
         const next=Math.max(0,Math.min(5,Number(event.target.value)));
         setSubtitleFrom(next);setSubtitleTo(previous=>Math.max(previous,next));
        }}/></label>
       <label>字幕结束（秒）<input type="number" min="0" max="5" step=".5"
        value={subtitleTo} onChange={event=>setSubtitleTo(
         Math.max(subtitleFrom,Math.min(5,Number(event.target.value))))}/></label>
      </div>
      <label className="sf-zero-checkbox"><input type="checkbox" checked={showTitle}
       onChange={event=>setShowTitle(event.target.checked)}/> 显示根据提示词生成的画面标题</label>
      <small>裁剪、转场和字幕仅作用于导出版本，不修改手机里的原文件。</small>
     </div>
     <div className="sf-creative-panel-title"><h2>控制画面比例与色调</h2><span>04 / 输出</span></div>
     <div className="sf-creative-style-grid">
      {styleNames.map(item=><button type="button" key={item.key}
       className={style===item.key?'active':''} aria-pressed={style===item.key}
       onClick={()=>setStyle(item.key)}><strong>{item.title}</strong></button>)}
     </div>
     <div className="sf-creative-controls">
      <label>画面比例<select value={aspect}
       onChange={e=>setAspect(e.target.value as ZeroAspect)}>
       <option value="9:16">9:16 竖屏</option>
       <option value="16:9">16:9 横屏</option>
       <option value="1:1">1:1 方形</option>
      </select></label>
      <label>渲染时长<select value="5" disabled><option value="5">5 秒 / 24FPS（本地视频）</option></select></label>
     </div>
     {busy?<button type="button" className="sf-creative-generate" onClick={stop}>
      <LoaderCircle className="sf-creative-spin" size={20}/> 取消渲染 · {progress}%
     </button>:<button type="button" className="sf-creative-generate" disabled={!canSubmit}
      onClick={()=>void create()}><WandSparkles size={20}/> 免费生成作品</button>}
     {error&&<p className="sf-creative-error" role="alert">{error}</p>}
     {notice&&<p className="sf-creative-notice" role="status">{notice}</p>}
     <p className="sf-creative-fineprint">创作原始图片/视频保留在你当前设备，不上传服务器。仅文字提示词发送给星流自己的免费场景规划 API。视频录制依赖 Safari/Chrome 支持，失败不收费。</p>
    </section>
    <aside className="sf-creative-results" aria-label="零预算作品输出">
     <div className="sf-creative-panel-title"><h2>本机生成结果</h2><span>100% 本地渲染</span></div>
     {!result?<div className="sf-creative-empty">
      <Clapperboard size={40}/><h3>第一部作品，从这里开始</h3>
      <p>概念海报可以直接导出 PNG。视频会在你的浏览器里实时编码，完成后可以保存。</p>
     </div>:<article className="sf-creative-job sf-zero-output">
      <div className="sf-creative-job-top"><strong>星流 Zero 本地作品</strong><span data-status="completed">已完成</span></div>
      {result.mime.startsWith('image/')?
       <img src={result.url} alt="星流程序化概念海报"/>:
       <video src={result.url} controls playsInline preload="metadata" aria-label="星流本地渲染视频"/>}
      <a href={result.url} download={result.filename}><Download size={18}/> 保存作品（{result.filename.split('.').at(-1)?.toUpperCase()}）</a>
      {lastPlan&&<small>Starflow Zero v0.1 · {lastPlan.width}×{lastPlan.height} · 设备端生成</small>}
     </article>}
     <div className="sf-zero-architecture">
      <h3>自主引擎架构</h3>
      <p>Starflow Zero API → 自研镜头/配色解析 → Canvas 图像引擎 → 浏览器视频编码 → 本地下载。</p>
      <p>后续扩展开放权重模型推理接口，但不会因为后台配置了付费 API 就自动扣费。</p>
     </div>
    </aside>
   </div>
  </div>
 </main>;
}
