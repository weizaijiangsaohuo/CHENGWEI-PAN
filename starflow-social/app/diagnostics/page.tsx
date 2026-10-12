'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Activity,ArrowLeft,CheckCircle2,ClipboardCopy,Info,LoaderCircle,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';
import styles from './diagnostics.module.css';

type Grade='ok'|'limited'|'error';
type Check={id:string;label:string;grade:Grade;detail:string};
type Health={name?:unknown;status?:unknown};
const labels:Record<Grade,string>={ok:'基本可用',limited:'需注意',error:'异常'};

function capability(id:string,label:string,available:boolean,detail:string,unavailable:string):Check{
 return {id,label,grade:available?'ok':'limited',detail:available?detail:unavailable};
}

function inspectBrowser():Check[]{
 const checks:Check[]=[];
 checks.push(capability('secure','HTTPS 安全环境',window.isSecureContext,
  '当前页面处于安全上下文。','当前不是安全上下文，音视频权限可能受到限制。'));
 checks.push(capability('rtc','音视频通话基础接口',
  typeof window.RTCPeerConnection==='function'&&Boolean(navigator.mediaDevices?.getUserMedia),
  '检测到 WebRTC 与媒体采集接口；实际拨打和权限尚未验证。',
  'WebRTC 或媒体采集接口不可用，实际通话可能失败。'));
 checks.push(capability('realtime','实时通信基础接口',typeof window.WebSocket==='function',
  '检测到 WebSocket 接口；这不代表私信实时收发已经连通。',
  '当前浏览器缺少 WebSocket，实时消息可能不可用。'));
 let recording=false,formats:string[]=[];
 try{
  recording=typeof HTMLCanvasElement!=='undefined'&&
   typeof HTMLCanvasElement.prototype.captureStream==='function'&&
   typeof MediaRecorder==='function';
  if(recording&&typeof MediaRecorder.isTypeSupported==='function'){
   formats=['video/mp4','video/webm'].filter(type=>MediaRecorder.isTypeSupported(type));
  }
 }catch{recording=false;}
 checks.push(capability('record','视频导出基础接口',recording&&formats.length>0,
  '支持浏览器录像接口（'+formats.map(x=>x.split('/')[1].toUpperCase()).join(' / ')+'）；未实际录制，不能证明 4K 或 120FPS。',
  '当前没有检测到可用的 Canvas 视频录制格式。'));
 const notifications=typeof window.Notification!=='undefined';
 checks.push({
  id:'notifications',label:'浏览器通知',grade:!notifications?'limited':
   Notification.permission==='granted'?'ok':'limited',
  detail:!notifications?'当前浏览器不支持网页通知。':
   Notification.permission==='granted'?'网页通知权限已允许；不代表推送服务器已连通。':
   Notification.permission==='denied'?'网页通知权限被拒绝，请在系统设置中更改。':
   '浏览器支持通知，但尚未授予权限；本次检测不会弹出授权请求。'
 });
 checks.push(capability('push','后台推送基础接口',
  'serviceWorker' in navigator&&'PushManager' in window,
  '检测到 Service Worker 与 Push API；未验证订阅、到达率或后台推送。',
  '该浏览器或环境缺少网页后台推送接口。'));
 checks.push(capability('share','系统文件分享',
  typeof navigator.share==='function',
  '支持系统分享接口；部分文件类型仍可能无法分享。',
  '此环境不支持系统分享，可改用浏览器下载。'));
 checks.push(capability('storage','本地文件与数据接口',
  typeof window.indexedDB!=='undefined'&&typeof window.URL?.createObjectURL==='function',
  '检测到 IndexedDB 与本地文件对象接口；未验证持久空间。',
  '浏览器本地存储或文件对象接口不可用。'));
 try{
  const key='sf-diagnostics-ephemeral';
  window.sessionStorage.setItem(key,'1');
  const stored=window.sessionStorage.getItem(key)==='1';
  window.sessionStorage.removeItem(key);
  checks.push(capability('session','临时会话存储',stored,
   '本次写入、读取、删除测试成功，不包含账号资料。',
   '临时会话存储不可用，可能处于严格隐私模式。'));
 }catch{
  checks.push({id:'session',label:'临时会话存储',grade:'limited',
   detail:'浏览器拒绝临时会话存储，可能影响某些页面状态。'});
 }
 return checks;
}

async function inspectServer(signal:AbortSignal):Promise<Check>{
 const started=performance.now();
 try{
  const response=await fetch('/api/health',{method:'GET',cache:'no-store',
   credentials:'same-origin',signal,headers:{Accept:'application/json'}});
  if(!response.ok)return{id:'server',label:'星流网站服务',grade:'error',
   detail:'同源健康接口返回 HTTP '+response.status+'，请稍后重试。'};
  const payload=await response.json() as Health;
  if(payload.name!=='Starflow')throw Error('健康接口返回内容不符合预期');
  const latency=Math.round(performance.now()-started);
  if(payload.status==='configured')return{id:'server',label:'星流网站服务',grade:'ok',
   detail:'服务器已响应（约 '+latency+'ms），检测到基础后端配置。未测试数据库读写、登录或消息发送。'};
  return{id:'server',label:'星流网站服务',grade:'limited',
   detail:'服务器已响应（约 '+latency+'ms），但基础后端配置待确认。'};
 }catch(error){
  return{id:'server',label:'星流网站服务',grade:'error',
   detail:signal.aborted?'请求超时或已取消，不能确认线上服务连通。':
    '无法访问网站健康接口：'+(error instanceof Error?error.message:'网络错误')};
 }
}

export default function DiagnosticsPage(){
 const [checking,setChecking]=useState(false);
 const [checks,setChecks]=useState<Check[]>([]);
 const [testedAt,setTestedAt]=useState('');
 const [copyNotice,setCopyNotice]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const run=useCallback(async()=>{
  if(controller.current)return;
  setChecking(true);setCopyNotice('');setChecks([]);setTestedAt('');
  const next=inspectBrowser();
  setChecks(next);
  const c=new AbortController();controller.current=c;
  const timer=window.setTimeout(()=>c.abort(),8000);
  try{
   const health=await inspectServer(c.signal);
   setChecks([...next,health]);
   setTestedAt(new Date().toLocaleString('zh-CN'));
  }finally{
   window.clearTimeout(timer);
   controller.current=null;
   setChecking(false);
  }
 },[]);
 const totals=useMemo(()=>({
  ok:checks.filter(c=>c.grade==='ok').length,
  limited:checks.filter(c=>c.grade==='limited').length,
  error:checks.filter(c=>c.grade==='error').length
 }),[checks]);
 const report=useMemo(()=>(
  'Starflow 2.0 浏览器与服务自检\n'
  +'检测时间：'+(testedAt||'检测中')+'\n'
  +'说明：接口可用不代表相关业务功能已经完成实际验收。\n\n'
  +checks.map(c=>labels[c.grade]+' | '+c.label+' | '+c.detail).join('\n')
 ),[checks,testedAt]);
 const copy=async()=>{
  try{
   await navigator.clipboard.writeText(report);
   setCopyNotice('报告已复制，可以发送给开发人员。');
  }catch{setCopyNotice('未获得剪贴板权限，请长按下方报告文本复制。');}
 };
 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.topbar}>
    <Link className={styles.back} href="/settings"><ArrowLeft size={18}/> 返回设置</Link>
    <span className={styles.wordmark}><Activity size={18}/> STARFLOW 2.0</span>
   </header>
   <section className={styles.hero}>
    <div className={styles.kicker}><ShieldCheck size={16}/> 设备端诊断 · 免费 · 不收集隐私文件</div>
    <h1>设备与服务自检</h1>
    <p>检查当前手机、电脑和网站服务的基础兼容能力，帮助定位登录、消息、音视频和分享问题。检测结果只显示在当前页面，不会主动上传设备报告。</p>
    <button type="button" className={styles.primary} onClick={()=>void run()} disabled={checking}>
     {checking?<LoaderCircle size={18} className={styles.spin}/>:<RefreshCw size={18}/>}
     {checking?'正在检查当前设备…':checks.length?'重新检测':'开始完整自检'}
    </button>
    {checking&&<p role="status" aria-live="polite" className={styles.hint}>正在检查网站服务器响应；最长等待约 8 秒。</p>}
   </section>
   {checks.length>0&&<section aria-label="自检结果" className={styles.results}>
    <div className={styles.summary}>
     <span><CheckCircle2 size={17}/> 基本可用 <strong>{totals.ok}</strong></span>
     <span><Info size={17}/> 需注意 <strong>{totals.limited}</strong></span>
     <span><TriangleAlert size={17}/> 异常 <strong>{totals.error}</strong></span>
    </div>
    {testedAt&&<p className={styles.timestamp}>检测完成：{testedAt}（当前设备本地时间）</p>}
    <div className={styles.cards}>
     {checks.map(item=><article key={item.id} className={styles.card}>
      <div className={styles.cardHead}>
       <h2>{item.label}</h2>
       <span className={styles[item.grade]}>{labels[item.grade]}</span>
      </div>
      <p>{item.detail}</p>
     </article>)}
    </div>
    {testedAt&&<div className={styles.reportArea}>
     <button type="button" className={styles.secondary} onClick={()=>void copy()}>
      <ClipboardCopy size={17}/> 复制检测报告
     </button>
     {copyNotice&&<p role="status" className={styles.hint}>{copyNotice}</p>}
     <details><summary>查看完整文字报告</summary>
      <textarea readOnly aria-label="完整检测报告" value={report} rows={11}/>
     </details>
    </div>}
   </section>}
   <section className={styles.notes}>
    <h2>哪些问题还需要真实测试？</h2>
    <p>以上只是浏览器 API 和网站健康接口检测。<strong>实际的注册登录、消息投递、音视频通话、通知推送、图片上传和页面速度</strong>，还需要在真实账号与实际网络下分别验收。任何“基本可用”都不代表相关业务已经全面通过。</p>
    <div className={styles.shortcut}>
     <Link href="/">返回首页</Link>
     <Link href="/notifications">检查通知页面</Link>
     <Link href="/messages">检查私信页面</Link>
     <Link href="/support">联系星流 AI 客服</Link>
    </div>
   </section>
  </div>
 </main>;
}
