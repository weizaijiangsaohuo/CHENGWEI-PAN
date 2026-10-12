'use client';
import {useEffect,useRef,useState} from 'react';
import {FileAudio,MapPin,Mic,MicOff,Send,Square,Speech,Volume2,X} from 'lucide-react';
import {db} from '@/lib/supabase';
import {StarflowMediaCapability} from './StarflowMediaCapability';

const BUCKET='sf-private-dm-voice';
type SpeechResult={results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>;resultIndex:number};
type Recognition={lang:string;interimResults:boolean;continuous:boolean;onresult:((event:SpeechResult)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};
type RecognitionConstructor=new()=>Recognition;
function voiceMime(){
 if(typeof MediaRecorder==='undefined')return null;
 for(const type of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg']){
  if(MediaRecorder.isTypeSupported(type))return type;
 }
 return null;
}
function messageOf(e:unknown){
 if(e instanceof DOMException){
  if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError')return '未获得麦克风权限，请在浏览器的网站设置中允许使用麦克风。';
  if(e.name==='NotFoundError')return '没有找到可用麦克风，请检查设备或耳机。';
  if(e.name==='NotReadableError')return '麦克风可能正被其他应用占用，请关闭占用麦克风的应用后重试。';
  if(e.name==='SecurityError')return '请通过 HTTPS 打开星流，才可以使用麦克风。';
 }
 return e instanceof Error?e.message:'操作失败，请重试';
}
function normalizeVoice(file:File):{extension:string;type:string}|null{
 const name=file.name.toLowerCase();const kind=file.type.toLowerCase();
 if(kind.includes('mp4')||kind.includes('m4a')||/\.m4a$|\.mp4$/.test(name))return {extension:'mp4',type:'audio/mp4'};
 if(kind==='audio/mpeg'||name.endsWith('.mp3'))return {extension:'mp3',type:'audio/mpeg'};
 if(kind.includes('wav')||name.endsWith('.wav'))return {extension:'wav',type:'audio/wav'};
 if(kind.includes('ogg')||name.endsWith('.ogg'))return {extension:'ogg',type:'audio/ogg'};
 if(kind.includes('webm')||name.endsWith('.webm'))return {extension:'webm',type:'audio/webm'};
 if(kind==='audio/aac'||name.endsWith('.aac'))return {extension:'aac',type:'audio/aac'};
 return null;
}
async function portableWav(audio:Blob):Promise<Blob>{
 // 16 kHz mono PCM WAV plays in Safari, Chrome, Edge, Firefox on iOS/Android/Mac/PC.
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(await audio.arrayBuffer());
  const sampleRate=16000;
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*sampleRate),sampleRate);
  const source=offline.createBufferSource();
  source.buffer=decoded;
  source.connect(offline.destination);
  source.start(0);
  const pcm=(await offline.startRendering()).getChannelData(0);
  const buffer=new ArrayBuffer(44+pcm.length*2);
  const view=new DataView(buffer);
  function fourcc(offset:number,value:string){for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));}
  fourcc(0,'RIFF');view.setUint32(4,36+pcm.length*2,true);fourcc(8,'WAVE');
  fourcc(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);
  fourcc(36,'data');view.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++){
   const sample=Math.max(-1,Math.min(1,pcm[i]));
   view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);
  }
  return new Blob([buffer],{type:'audio/wav'});
 }finally{await context.close();}
}
export function StarflowVoicePlayer({path,seconds}:{path:string;seconds:number}){
 const [url,setUrl]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [transcript,setTranscript]=useState('');
 const [transcribing,setTranscribing]=useState(false);
 const objectUrl=useRef('');
 const audioBlob=useRef<Blob|null>(null);
 const currentPath=useRef(path);
 const playbackRequest=useRef(0);
 const receivedController=useRef<AbortController|null>(null);
 useEffect(()=>{
  currentPath.current=path;
  playbackRequest.current+=1;
  receivedController.current?.abort();
  receivedController.current=null;
  setTranscribing(false);setLoading(false);
  audioBlob.current=null;setTranscript('');setUrl('');setError('');
  return ()=>{
   receivedController.current?.abort();
   playbackRequest.current+=1;
   if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current='';}
  };
 },[path]);
 async function play(){
  if(loading)return;
  const requestId=++playbackRequest.current;
  const requestedPath=path;
  setLoading(true);setError('');
  try{
   // Fetch through authenticated private Storage RLS, then play a same-origin blob.
   // Safari can stall when seeking a cross-origin signed URL with Range requests.
   const {data,error:err}=await db().storage.from(BUCKET).download(path);
   if(err||!data)throw Error(err?.message||'语音文件不存在或没有读取权限');
   if(data.size===0||data.size>8*1024*1024)throw Error('语音文件损坏或超过允许大小');
   if(playbackRequest.current!==requestId||currentPath.current!==requestedPath)return;
   audioBlob.current=data;
   const next=URL.createObjectURL(data);
   if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
   objectUrl.current=next;setUrl(next);
  }catch(e){if(playbackRequest.current===requestId)setError(messageOf(e))}
  finally{if(playbackRequest.current===requestId)setLoading(false)}
 }
 async function transcribeReceived(){
  if(transcribing||receivedController.current)return;
  if(!window.confirm('是否使用 Cloudflare AI 将此条私人语音识别成文字？这条语音不会公开发布。'))return;
  const requestedPath=path;
  const controller=new AbortController();
  receivedController.current=controller;
  const timeout=window.setTimeout(()=>controller.abort(),45000);
  setTranscribing(true);setError('');
  try{
   let blob=audioBlob.current;
   if(!blob){
    const {data,error}=await db().storage.from(BUCKET).download(requestedPath);
    if(error||!data)throw Error(error?.message||'无法读取该语音');
    if(controller.signal.aborted||currentPath.current!==requestedPath)return;
    blob=data;audioBlob.current=data;
   }
   // Prefer a browser-decoded 16-kHz mono WAV across MP4/WebM/OGG.
   // Fall back to the valid original file if decoding is unavailable.
   let payload=blob;
   let mediaType=blob.type||'audio/webm';
   const extension=requestedPath.split('.').at(-1)?.toLowerCase();
   mediaType=extension==='wav'?'audio/wav':extension==='mp3'?'audio/mpeg':
    extension==='aac'?'audio/aac':extension==='ogg'?'audio/ogg':
    extension==='mp4'?'audio/mp4':mediaType;
   try{payload=await portableWav(blob);mediaType='audio/wav';}
   catch{/* Existing supported codec remains usable when Safari cannot decode locally. */}
   if(controller.signal.aborted||currentPath.current!==requestedPath)return;
   if(payload.size>6*1024*1024)throw Error('文件过大，无法自动转写。');
   const {data:{session}}=await db().auth.getSession();
   if(!session?.access_token)throw Error('请重新登录星流。');
   if(controller.signal.aborted||currentPath.current!==requestedPath)return;
   const response=await fetch('/api/voice/transcribe',{method:'POST',cache:'no-store',
    signal:controller.signal,
    headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':mediaType,
     'x-sf-speech-language':'auto'},
    body:payload});
   const result=await response.json() as {text?:string;error?:string};
   if(!response.ok||!result.text)throw Error(result.error||'无法识别语音');
   if(!controller.signal.aborted&&currentPath.current===requestedPath)setTranscript(result.text);
  }catch(e){
   if(currentPath.current!==requestedPath)return;
   setError(controller.signal.aborted?'语音识别等待超时，请重试。':messageOf(e));
  }finally{
   window.clearTimeout(timeout);
   if(receivedController.current===controller){receivedController.current=null;setTranscribing(false);}
  }
 }
 const extension=path.split('.').at(-1)?.toLowerCase();
   const mediaType=extension==='wav'?'audio/wav':extension==='mp3'?'audio/mpeg':extension==='aac'?'audio/aac':extension==='ogg'?'audio/ogg':extension==='mp4'?'audio/mp4':blob.type||'audio/webm';
   const response=await fetch('/api/voice/transcribe',{method:'POST',cache:'no-store',
    headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':mediaType,
     'x-sf-speech-language':'zh'},
    body:blob});
   const result=await response.json() as {text?:string;error?:string};
   if(!response.ok||!result.text)throw Error(result.error||'无法识别语音');
   setTranscript(result.text);
  }catch(e){setError(messageOf(e))}
  finally{setTranscribing(false)}
 }
 const extension=path.split('.').at(-1)?.toLowerCase()||'bin';
 return <span className="sf-dm-voice-player">
  <Volume2 size={17}/>{url?<>
   <audio aria-label="私信语音" controls preload="auto" src={url}
    onError={()=>setError('当前浏览器无法播放此音频编码（'+extension+'）。可保存文件后使用其他播放器。')}/>
   <small>如果未自动播放，请点击播放键。</small>
   </>:
   <button type="button" onClick={()=>void play()} disabled={loading}>
    {loading?'正在安全读取语音…':('加载语音 · '+Math.ceil(seconds)+'秒')}
   </button>}
  {url&&<a href={url} download={'starflow-voice.'+extension} className="sf-dm-save-voice">保存语音</a>}
  <button type="button" onClick={()=>void transcribeReceived()} disabled={transcribing||loading} className="sf-dm-transcribe-note">{transcribing?'识别中…':'转为文字'}</button>
  {transcript&&<small className="sf-dm-voice-transcript">{transcript}</small>}
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
 const [clipFormat,setClipFormat]=useState<{extension:string;type:string}|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const [clipUrl,setClipUrl]=useState('');
 const [busy,setBusy]=useState(false);
 const [recognizing,setRecognizing]=useState(false);
 const [speechBusy,setSpeechBusy]=useState(false);
 const [speechLanguage,setSpeechLanguage]=useState('auto');
 const recordMode=useRef<'voice'|'dictation'>('voice');
 const recorder=useRef<MediaRecorder|null>(null);
 const tracks=useRef<MediaStream|null>(null);
 const fragments=useRef<Blob[]>([]);
 const cancelOnStop=useRef(false);
 const recognition=useRef<Recognition|null>(null);
 const clipUrlRef=useRef('');
 const transcriptionController=useRef<AbortController|null>(null);
 const currentConversation=useRef(conversationId);
 const cancelRecorder=()=>{
  cancelOnStop.current=true;
  if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();
  tracks.current?.getTracks().forEach(track=>track.stop());
  tracks.current=null;
  recorder.current=null;
 };
useEffect(()=>{
  currentConversation.current=conversationId;
  transcriptionController.current?.abort();
  transcriptionController.current=null;
  setSpeechBusy(false);setRecognizing(false);
  cancelRecorder();recognition.current?.stop();setClip(null);setClipFormat(null);setClipUrl('');setElapsed(0);
  if(clipUrlRef.current)URL.revokeObjectURL(clipUrlRef.current);clipUrlRef.current='';
  return ()=>{
   transcriptionController.current?.abort();
   cancelRecorder();recognition.current?.stop();
   if(clipUrlRef.current)URL.revokeObjectURL(clipUrlRef.current);
  };
 },[conversationId]);
 useEffect(()=>{
  if(!recording)return;
  const timer=window.setInterval(()=>setElapsed(t=>Math.min(120,t+1)),1000);
  return()=>window.clearInterval(timer);
 },[recording]);
 useEffect(()=>{if(recording&&elapsed>=120)stopRecording()},[recording,elapsed]);
 function clearClip(){setClip(null);setClipFormat(null);setClipUrl('');if(clipUrlRef.current)URL.revokeObjectURL(clipUrlRef.current);clipUrlRef.current='';}
 async function startRecording(mode:'voice'|'dictation'='voice'){
  recordMode.current=mode;
  if(disabled||busy||recording)return;
  if(!window.isSecureContext){onError('录音要求 HTTPS 安全连接。');return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   onError('当前浏览器不支持网页录音，请使用下方“选择音频”上传录音文件。');return;
  }
  const mime=voiceMime();
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   tracks.current=stream;fragments.current=[];cancelOnStop.current=false;
   const mr=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});
   recorder.current=mr;clearClip();setElapsed(0);
   const startedAt=Date.now();
   mr.ondataavailable=e=>{if(e.data.size)fragments.current.push(e.data)};
   mr.onerror=()=>{onError('语音录制中断');setRecording(false);setRecognizing(false);stream.getTracks().forEach(t=>t.stop())};
   mr.onstop=()=>{
    setRecording(false);stream.getTracks().forEach(t=>t.stop());tracks.current=null;
    if(cancelOnStop.current)return;
    const seconds=Math.round((Date.now()-startedAt)/1000);
    const resultType=mr.mimeType?.split(';')[0]||mime?.split(';')[0]||fragments.current[0]?.type?.split(';')[0]||'';
    const format=normalizeVoice(new File([], 'recording.'+(resultType.includes('mp4')?'mp4':resultType.includes('webm')?'webm':resultType.includes('ogg')?'ogg':'bin'),{type:resultType}));
    if(!format){setRecognizing(false);onError('当前设备录音编码尚不支持，请使用系统键盘听写。');return;}
    const blob=new Blob(fragments.current,{type:format.type});
    if(seconds<1||blob.size===0){setRecognizing(false);onError('录音太短，请重新录制。');return;}
    if(blob.size>8*1024*1024){setRecognizing(false);onError('语音文件超过8MB，请重新录制。');return;}
    if(recordMode.current==='dictation'){void transcribeAudio(blob);return;}
    const objectUrl=URL.createObjectURL(blob);clipUrlRef.current=objectUrl;setClipFormat(format);setClip(blob);setClipUrl(objectUrl);
    setElapsed(Math.max(1,Math.min(120,seconds)));
   };
   mr.start(250);setRecording(true);
  }catch(e){tracks.current?.getTracks().forEach(t=>t.stop());tracks.current=null;setRecognizing(false);onError(messageOf(e))}
 }
 function stopRecording(){if(recorder.current?.state==='recording')recorder.current.stop()}
 async function chooseFile(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file||disabled||busy)return;
  const format=normalizeVoice(file);
  if(!format){onError('请选择 MP4/M4A、WebM、Ogg、MP3、WAV 或 AAC 格式音频。');return;}
  if(file.size<1||file.size>8*1024*1024){onError('音频文件大小必须在1字节至8MB之间。');return;}
  const url=URL.createObjectURL(file);
  const probe=new Audio();probe.preload='metadata';probe.src=url;
  try{
   const seconds=await new Promise<number>((resolve,reject)=>{
    const timeout=window.setTimeout(()=>reject(Error('无法读取音频时长，请换一种格式。')),10000);
    probe.onloadedmetadata=()=>{window.clearTimeout(timeout);resolve(probe.duration)};
    probe.onerror=()=>{window.clearTimeout(timeout);reject(Error('当前设备无法读取这个音频文件。'))};
   });
   if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw Error('语音时长必须为1至120秒。');
   clearClip();
   // clearClip revokes the previous URL, not the newly selected one.
   clipUrlRef.current=url;setClip(file);setClipFormat(format);setClipUrl(url);setElapsed(Math.ceil(seconds));
  }catch(e){URL.revokeObjectURL(url);onError(messageOf(e))}
  finally{probe.onloadedmetadata=null;probe.onerror=null;probe.pause();probe.removeAttribute('src');}
 }
 async function sendVoice(){
  if(!clip||disabled||busy)return;
  if(!clipFormat){onError('音频格式无效');return;}
  setBusy(true);
  try{
   let payload=clip;
   let format=clipFormat;
   try{
    payload=await portableWav(clip);
    format={extension:'wav',type:'audio/wav'};
   }catch{/* Fall back to the original supported recording when local decoding is unavailable. */}
   if(payload.size>8*1024*1024)throw Error('音频文件超过8MB，无法发送。');
   const path=conversationId+'/'+userId+'/'+crypto.randomUUID()+'.'+format.extension;
   const client=db();
   const result=await client.storage.from(BUCKET).upload(path,payload,{cacheControl:'3600',contentType:format.type,upsert:false});
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
 async function transcribeAudio(blob:Blob){
  if(transcriptionController.current)return;
  const requestedConversation=conversationId;
  const controller=new AbortController();
  transcriptionController.current=controller;
  const timeout=window.setTimeout(()=>controller.abort(),45000);
  setSpeechBusy(true);
  try{
   // Normalize common iOS MP4 and Android/desktop WebM recordings to a
   // portable WAV when the browser can decode it; preserve the original
   // supported codec if decoding is unavailable.
   let payload=blob;
   try{payload=await portableWav(blob);}catch{/* Keep supported source codec. */}
   if(controller.signal.aborted||currentConversation.current!==requestedConversation)return;
   if(payload.size>6*1024*1024)throw Error('录音文件超过语音识别限制（6MB），请缩短录音。');
   const {data:{session}}=await db().auth.getSession();
   if(!session?.access_token)throw Error('登录状态已失效，请重新登录星流。');
   if(controller.signal.aborted||currentConversation.current!==requestedConversation)return;
   const result=await fetch('/api/voice/transcribe',{
    method:'POST',cache:'no-store',signal:controller.signal,
    headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':payload.type||'audio/webm',
     'x-sf-speech-language':speechLanguage},
    body:payload
   });
   const parsed=await result.json() as {text?:string;error?:string};
   if(!result.ok||!parsed.text)throw Error(parsed.error||'语音识别服务暂时不可用');
   // Never write private speech from a previous conversation to a new DM.
   if(controller.signal.aborted||currentConversation.current!==requestedConversation)return;
   setDraft(prev=>((prev?prev+(prev.endsWith(' ')?'':' '):'')+parsed.text).slice(0,2000));
   document.getElementById('sf-dm-input')?.focus();
  }catch(e){
   if(currentConversation.current!==requestedConversation)return;
   onError(controller.signal.aborted?'语音识别超时，请重试或使用系统键盘听写。':messageOf(e));
  }finally{
   window.clearTimeout(timeout);
   if(transcriptionController.current===controller){
    transcriptionController.current=null;
    setSpeechBusy(false);setRecognizing(false);
   }
  }
 }
 function startSpeech(){
  if(disabled||busy||recognizing||recording||speechBusy)return;
  // Prefer recorded audio + authenticated Cloudflare Whisper over fragile iOS WebSpeech.
  if(typeof navigator.mediaDevices?.getUserMedia==='function' && typeof MediaRecorder!=='undefined'){
   if(!window.confirm('是否录音并将本次语音发送至星流的 Cloudflare AI 识别文字？只填写输入框，不会自动发送消息。'))return;
   setRecognizing(true);
   void startRecording('dictation');
   return;
  }
  const w=window as typeof window&{SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  const Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Ctor){document.getElementById('sf-dm-input')?.focus();onError('当前浏览器没有网页语音识别接口。可在弹出的手机键盘或电脑输入法中使用系统语音输入。');return;}
  const r=new Ctor();
  // Browser-native speech engines do not support automatic language detection,
  // so use an explicit choice or the interface language as a hint.
  const browserSpeechLanguage=speechLanguage==='auto'?
   (lang.startsWith('en')?'en-US':lang.startsWith('ja')?'ja-JP':lang.startsWith('ko')?'ko-KR':
    lang.startsWith('fr')?'fr-FR':lang.startsWith('de')?'de-DE':'zh-CN'):
   ({zh:'zh-CN',en:'en-US',ja:'ja-JP',ko:'ko-KR',fr:'fr-FR',de:'de-DE',
     es:'es-ES',it:'it-IT',pt:'pt-PT',ru:'ru-RU'} as Record<string,string>)[speechLanguage]||'zh-CN';
  r.lang=browserSpeechLanguage;r.interimResults=false;r.continuous=false;
  r.onresult=event=>{
   let text='';
   for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal)text+=event.results[i][0].transcript;}
   const next=text.trim();if(next)setDraft(prev=> ((prev?(prev.endsWith(' ')?prev:prev+' '):'')+next).slice(0,2000));
  };
  r.onerror=event=>{setRecognizing(false);if(event.error==='aborted')onError('浏览器中止了语音识别，请尝试系统键盘的麦克风听写。');else onError('语音识别失败：'+event.error)};
  r.onend=()=>{setRecognizing(false);recognition.current=null};
  try{recognition.current=r;r.start();setRecognizing(true);}catch(e){onError(messageOf(e));setRecognizing(false);}
 }
 return <div className="sf-dm-extra-tools">
  <label className="sf-dm-speech-language">
   <span>语音识别语言</span>
   <select value={speechLanguage} onChange={event=>setSpeechLanguage(event.target.value)}
     disabled={recording||recognizing||speechBusy} aria-label="语音转文字的语言">
    <option value="auto">自动识别（推荐）</option>
    <option value="zh">中文</option><option value="en">English</option>
    <option value="ja">日本語</option><option value="ko">한국어</option>
    <option value="fr">Français</option><option value="de">Deutsch</option>
    <option value="es">Español</option><option value="it">Italiano</option>
    <option value="pt">Português</option><option value="ru">Русский</option>
   </select>
  </label>
  <div className="sf-dm-extra-actions">
   <button type="button" onClick={()=>recording?stopRecording():void startRecording()} disabled={disabled||busy} aria-label={recording?'结束录音':'录制语音消息'} title="录制语音消息">
    {recording?<Square size={18}/>:<Mic size={19}/>}<span>{recording?'结束录音 '+elapsed+'s':'语音消息'}</span>
   </button>
   <button type="button" onClick={()=>recognizing?(recordMode.current==='dictation'?stopRecording():recognition.current?.stop()):startSpeech()} disabled={disabled||busy||speechBusy} aria-label={recognizing?'结束录音并转文字':'语音识别转文字'} title="语音转文字">
    {recognizing?<MicOff size={18}/>:<Speech size={19}/>}<span>{speechBusy?'正在识别…':recognizing?'结束并转文字':'语音转文字'}</span>
   </button>
   <input ref={fileInput} className="sf-dm-sr-only" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac" aria-label="选择已录制的音频文件" onChange={e=>void chooseFile(e)}/>
   <button type="button" onClick={()=>fileInput.current?.click()} disabled={disabled||busy} aria-label="选择音频文件" title="适配 iOS、Android、Windows 和 macOS 的已有录音"><FileAudio size={19}/><span>选择音频</span></button>
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
  {recognizing&&<p className="sf-dm-recording">正在录音，点击“结束并转文字”后由 AI 识别，结果只填入输入框，不会自动发送。</p>}
  {speechBusy&&<p className="sf-dm-recording">正在处理录音，请稍候…</p>}
  <StarflowMediaCapability/>
 </div>;
}
