'use client';
import {useEffect,useRef,useState} from 'react';
import {MapPin,Mic,MicOff,Send,Square,Speech,Volume2,X} from 'lucide-react';
import {db} from '@/lib/supabase';

const BUCKET='sf-private-dm-voice';
type SpeechResult={results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>;resultIndex:number};
type Recognition={lang:string;interimResults:boolean;continuous:boolean;onresult:((event:SpeechResult)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};
type RecognitionConstructor=new()=>Recognition;
function voiceMime(){
 if(typeof MediaRecorder==='undefined')return null;
 for(const type of ['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus']){
  if(MediaRecorder.isTypeSupported(type))return type;
 }
 return null;
}
function messageOf(e:unknown){return e instanceof Error?e.message:'操作失败，请重试';}
export function StarflowVoicePlayer({path,seconds}:{path:string;seconds:number}){
 const [url,setUrl]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setUrl('');setError('')},[path]);
 async function play(){
  if(loading)return;
  setLoading(true);
  try{
   const {data,error:err}=await db().storage.from(BUCKET).createSignedUrl(path,1800);
   if(err||!data?.signedUrl)throw Error(err?.message||'音频不可用');
   setUrl(data.signedUrl);
  }catch(e){setError(messageOf(e))}
  finally{setLoading(false)}
 }
 return <span className="sf-dm-voice-player">
  <Volume2 size={17}/>{url?
   <audio aria-label="私信语音" controls preload="none" src={url} controlsList="nodownload"/>:
   <button type="button" onClick={()=>void play()} disabled={loading}>{loading?'正在读取…':('播放语音 · '+Math.ceil(seconds)+'秒')}</button>}
  {error&&<small role="alert">{error}</small>}
 </span>;
}
export function StarflowLocationMessage({lat,lng}:{lat:number;lng:number}){
 const latitude=Number(lat),longitude=Number(lng);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return <span>定位不可用</span>;
 const url='https://www.openstreetmap.org/?mlat='+latitude+'&mlon='+longitude+'#map=16/'+latitude+'/'+longitude;
 return <span className="sf-dm-location"><MapPin size={18}/><span><strong>分享的位置</strong><small>{latitude.toFixed(5)}, {longitude.toFixed(5)}</small><a href={url} target="_blank" rel="noopener noreferrer">在地图中查看 ↗</a></span></span>;
}
export function StarflowDmTools({userId,conversationId,disabled,lang,draft,setDraft,onSent,onError}:{
 userId:string;conversationId:string;disabled:boolean;lang:string;draft:string;
 setDraft:(update:(current:string)=>string)=>void;onSent:()=>Promise<void>;onError:(text:string)=>void
}){
 const [recording,setRecording]=useState(false);
 const [elapsed,setElapsed]=useState(0);
 const [clip,setClip]=useState<Blob|null>(null);
 const [clipUrl,setClipUrl]=useState('');
 const [busy,setBusy]=useState(false);
 const [recognizing,setRecognizing]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null);
 const tracks=useRef<MediaStream|null>(null);
 const fragments=useRef<Blob[]>([]);
 const cancelOnStop=useRef(false);
 const recognition=useRef<Recognition|null>(null);
 const clipUrlRef=useRef('');
 const cancelRecorder=()=>{
  cancelOnStop.current=true;
  if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();
  tracks.current?.getTracks().forEach(track=>track.stop());
  tracks.current=null;
  recorder.current=null;
 };
 useEffect(()=>()=>{cancelRecorder();recognition.current?.stop();if(clipUrlRef.current)URL.revokeObjectURL(clipUrlRef.current)},[conversationId]);
 useEffect(()=>{
  if(!recording)return;
  const timer=window.setInterval(()=>setElapsed(t=>Math.min(120,t+1)),1000);
  return()=>window.clearInterval(timer);
 },[recording]);
 useEffect(()=>{if(recording&&elapsed>=120)stopRecording()},[recording,elapsed]);
 function clearClip(){setClip(null);setClipUrl('');if(clipUrlRef.current)URL.revokeObjectURL(clipUrlRef.current);clipUrlRef.current='';}
 async function startRecording(){
  if(disabled||busy||recording)return;
  if(!navigator.mediaDevices?.getUserMedia){onError('当前浏览器不支持录音，请使用最新版 Safari 或 Chrome。');return;}
  const mime=voiceMime();
  if(!mime){onError('当前浏览器不支持录制可发送的语音格式。');return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   tracks.current=stream;fragments.current=[];cancelOnStop.current=false;
   const mr=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
   recorder.current=mr;clearClip();setElapsed(0);
   const startedAt=Date.now();
   mr.ondataavailable=e=>{if(e.data.size)fragments.current.push(e.data)};
   mr.onerror=()=>{onError('语音录制中断');setRecording(false);stream.getTracks().forEach(t=>t.stop())};
   mr.onstop=()=>{
    setRecording(false);stream.getTracks().forEach(t=>t.stop());tracks.current=null;
    if(cancelOnStop.current)return;
    const seconds=Math.round((Date.now()-startedAt)/1000);
    const blob=new Blob(fragments.current,{type:mime.split(';')[0]});
    if(seconds<1||blob.size===0){onError('录音太短，请重新录制。');return;}
    if(blob.size>8*1024*1024){onError('语音文件超过8MB，请重新录制。');return;}
    const objectUrl=URL.createObjectURL(blob);clipUrlRef.current=objectUrl;setClip(blob);setClipUrl(objectUrl);
    setElapsed(Math.max(1,Math.min(120,seconds)));
   };
   mr.start(250);setRecording(true);
  }catch(e){tracks.current?.getTracks().forEach(t=>t.stop());tracks.current=null;onError(messageOf(e))}
 }
 function stopRecording(){if(recorder.current?.state==='recording')recorder.current.stop()}
 async function sendVoice(){
  if(!clip||disabled||busy)return;
  setBusy(true);
  const extension=clip.type.includes('mp4')?'mp4':clip.type.includes('ogg')?'ogg':'webm';
  const path=conversationId+'/'+userId+'/'+crypto.randomUUID()+'.'+extension;
  try{
   const client=db();
   const result=await client.storage.from(BUCKET).upload(path,clip,{cacheControl:'3600',contentType:clip.type,upsert:false});
   if(result.error)throw result.error;
   const response=await client.rpc('sf_dm_send_voice',{p_conversation:conversationId,p_path:path,p_seconds:Math.max(1,Math.min(120,elapsed))});
   if(response.error){
    await client.storage.from(BUCKET).remove([path]);
    throw response.error;
   }
   clearClip();await onSent();
  }catch(e){onError(messageOf(e))}
  finally{setBusy(false)}
 }
 async function sendLocation(){
  if(disabled||busy)return;
  if(!navigator.geolocation){onError('浏览器不支持定位功能。');return;}
  if(!window.confirm('是否仅向当前聊天对象发送一次你的精确位置？不会持续共享或在后台追踪。'))return;
  setBusy(true);
  navigator.geolocation.getCurrentPosition(async point=>{
   try{
    const {error}=await db().rpc('sf_dm_send_location',{
     p_conversation:conversationId,p_lat:point.coords.latitude,p_lng:point.coords.longitude
    });
    if(error)throw error;
    await onSent();
   }catch(e){onError(messageOf(e))}
   finally{setBusy(false)}
  },e=>{onError(e.code===1?'你拒绝了定位权限，未发送任何位置信息。':'无法取得当前位置，请检查定位服务。');setBusy(false)},
  {enableHighAccuracy:false,timeout:12000,maximumAge:0});
 }
 function startSpeech(){
  if(disabled||busy||recognizing)return;
  const w=window as typeof window&{SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  const Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Ctor){onError('当前浏览器不支持网页语音识别；可使用手机键盘上的麦克风语音输入。');return;}
  const r=new Ctor();r.lang=lang.startsWith('en')?'en-US':'zh-CN';r.interimResults=false;r.continuous=false;
  r.onresult=event=>{
   let text='';
   for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal)text+=event.results[i][0].transcript;}
   const next=text.trim();if(next)setDraft(prev=> (prev?(prev.endsWith(' ')?prev:prev+' '):'')+next).slice(0,2000));
  };
  r.onerror=event=>{setRecognizing(false);onError('语音识别失败：'+event.error)};
  r.onend=()=>{setRecognizing(false);recognition.current=null};
  try{recognition.current=r;r.start();setRecognizing(true);}catch(e){onError(messageOf(e));setRecognizing(false);}
 }
 return <div className="sf-dm-extra-tools">
  <div className="sf-dm-extra-actions">
   <button type="button" onClick={()=>recording?stopRecording():void startRecording()} disabled={disabled||busy} aria-label={recording?'结束录音':'录制语音消息'} title="录制语音消息">
    {recording?<Square size={18}/>:<Mic size={19}/>}<span>{recording?'结束录音 '+elapsed+'s':'语音消息'}</span>
   </button>
   <button type="button" onClick={()=>recognizing?(recognition.current?.stop(),setRecognizing(false)):startSpeech()} disabled={disabled||busy} aria-label={recognizing?'停止语音识别':'语音识别转文字'} title="语音转文字">
    {recognizing?<MicOff size={18}/>:<Speech size={19}/>}<span>{recognizing?'停止听写':'语音转文字'}</span>
   </button>
   <button type="button" onClick={()=>void sendLocation()} disabled={disabled||busy} aria-label="发送当前位置" title="只发送一次当前位置">
    <MapPin size={19}/><span>{busy?'处理中…':'发送位置'}</span>
   </button>
  </div>
  {clip&&<div className="sf-dm-voice-preview">
    <audio controls src={clipUrl} preload="metadata" aria-label="待发送语音"/>
    <button type="button" onClick={()=>void sendVoice()} disabled={busy||disabled}><Send size={17}/>发送语音</button>
    <button type="button" onClick={clearClip} disabled={busy} aria-label="删除录音"><X size={17}/></button>
   </div>}
  {recording&&<p className="sf-dm-recording">● 正在录音，最长120秒；点击结束后可以试听，再决定是否发送。</p>}
  {recognizing&&<p className="sf-dm-recording">正在识别语音，识别结果只会填入输入框，不会自动发送。</p>}
 </div>;
}
