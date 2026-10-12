'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Phone,PhoneOff,Volume2} from 'lucide-react';
import {db} from '@/lib/supabase';

type Call={id:string;conversation_id:string;caller_id:string;callee_id:string;status:'ringing'|'active'|'ended'|'declined';created_at:string};
type Signal={id:string;sender_id:string;kind:'offer'|'answer'|'ice';payload:Record<string,unknown>};
function errText(e:unknown){return e instanceof Error?e.message:'语音通话失败';}
const DEFAULT_ICE:RTCIceServer[]=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
async function readIceServers():Promise<RTCIceServer[]>{
 try{
  const {data:{session}}=await db().auth.getSession();
  if(!session?.access_token)return DEFAULT_ICE;
  const response=await fetch('/api/rtc/ice',{
   headers:{Authorization:'Bearer '+session.access_token},
   cache:'no-store'
  });
  if(!response.ok)return DEFAULT_ICE;
  const info=await response.json() as {iceServers?:RTCIceServer[]};
  if(!Array.isArray(info.iceServers))return DEFAULT_ICE;
  // TURN URLs and temporary credentials originate only from the authenticated server.
  return [...DEFAULT_ICE,...info.iceServers];
 }catch{return DEFAULT_ICE}
}
export function StarflowVoiceCall({userId,conversationId,peerId,canSend,onError}:{
 userId:string;conversationId:string|null;peerId:string|null;canSend:boolean;onError:(message:string)=>void
}){
 const [call,setCall]=useState<Call|null>(null);
 const [connecting,setConnecting]=useState(false);
 const [muted,setMuted]=useState(false);
 const [status,setStatus]=useState('');
 const [remoteReady,setRemoteReady]=useState(false);
 const callRef=useRef<Call|null>(null);
 const pcRef=useRef<RTCPeerConnection|null>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const played=useRef<HTMLAudioElement|null>(null);
 const signalSeen=useRef(new Set<string>());
 const iceQueue=useRef<RTCIceCandidateInit[]>([]);
 const startedRef=useRef(false);
 const setupRef=useRef(false);
 const closedRef=useRef(false);
 const lockRef=useRef(false);

 const cleanup=useCallback(()=>{
  pcRef.current?.close();pcRef.current=null;
  streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
  if(played.current)played.current.srcObject=null;
  iceQueue.current=[];signalSeen.current.clear();startedRef.current=false;setupRef.current=false;
  closedRef.current=false;callRef.current=null;
  setCall(null);setConnecting(false);setRemoteReady(false);setStatus('');setMuted(false);
 },[]);
 useEffect(()=>()=>{pcRef.current?.close();streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 async function push(callId:string,kind:'offer'|'answer'|'ice',payload:Record<string,unknown>){
  const {error}=await db().from('sf_dm_call_signals').insert({call_id:callId,sender_id:userId,kind,payload});
  if(error)throw error;
 }
 async function buildPeer(item:Call,stream:MediaStream){
  if(pcRef.current)return pcRef.current;
  const pc=new RTCPeerConnection({iceServers:await readIceServers()});pcRef.current=pc;
  stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));
  pc.ontrack=event=>{
   if(played.current){played.current.srcObject=event.streams[0]||new MediaStream([event.track]);void played.current.play().catch(()=>{});}
   setRemoteReady(true);setStatus('语音已连接');
  };
  pc.onicecandidate=event=>{
   if(event.candidate)void push(item.id,'ice',event.candidate.toJSON() as Record<string,unknown>)
    .catch(e=>onError(errText(e)));
  };
  pc.onconnectionstatechange=()=>{
   if(pc.connectionState==='connected')setStatus('正在通话');
   if(pc.connectionState==='failed')setStatus('通话连接失败：网络可能需要 TURN 中继，请挂断后重试。');
   if(pc.connectionState==='disconnected')setStatus('对方网络暂时中断…');
  };
  return pc;
 }
 async function flushIce(){
  const pc=pcRef.current;
  if(!pc?.remoteDescription)return;
  const candidates=iceQueue.current.splice(0);
  for(const candidate of candidates)try{await pc.addIceCandidate(candidate)}catch{}
 }
 const consume=useCallback(async(callId:string)=>{
  const pc=pcRef.current;
  if(!pc)return;
  const result=await db().from('sf_dm_call_signals')
   .select('id,sender_id,kind,payload').eq('call_id',callId)
   .neq('sender_id',userId).order('created_at',{ascending:true}).limit(200);
  if(result.error)throw result.error;
  for(const s of (result.data||[]) as Signal[]){
   if(signalSeen.current.has(s.id))continue;
   signalSeen.current.add(s.id);
   if(s.kind==='offer' && callRef.current?.callee_id===userId && !pc.remoteDescription){
    const description=s.payload as unknown as RTCSessionDescriptionInit;
    if(description.type!=='offer'||typeof description.sdp!=='string')continue;
    await pc.setRemoteDescription(description);await flushIce();
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await push(callId,'answer',{type:answer.type,sdp:answer.sdp||''});setStatus('正在连接对方…');
   }else if(s.kind==='answer' && callRef.current?.caller_id===userId && !pc.remoteDescription){
    const description=s.payload as unknown as RTCSessionDescriptionInit;
    if(description.type!=='answer'||typeof description.sdp!=='string')continue;
    await pc.setRemoteDescription(description);await flushIce();setStatus('正在连接对方…');
   }else if(s.kind==='ice'){
    if(!s.payload.candidate || typeof s.payload.candidate!=='string')continue;
    const candidate=s.payload as RTCIceCandidateInit;
    if(pc.remoteDescription){try{await pc.addIceCandidate(candidate)}catch{}}
    else iceQueue.current.push(candidate);
   }
  }
 },[userId]);
 const getMic=async()=>{
  if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')
   throw Error('浏览器不支持实时语音通话，请使用 HTTPS 下的最新版 Safari 或 Chrome。');
  return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
 };
 async function start(){
  if(!conversationId||!peerId||!canSend||lockRef.current||callRef.current)return;
  lockRef.current=true;setConnecting(true);setStatus('正在申请麦克风权限…');
  let stream:MediaStream|null=null;
  try{
   stream=await getMic();streamRef.current=stream;
   const result=await db().rpc('sf_dm_start_call',{p_conversation:conversationId});
   if(result.error||typeof result.data!=='string')throw result.error||Error('创建通话失败');
   const item:Call={id:result.data,conversation_id:conversationId,caller_id:userId,callee_id:peerId,status:'ringing',created_at:new Date().toISOString()};
   callRef.current=item;setCall(item);
   const pc=await buildPeer(item,stream);setupRef.current=true;
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   await push(item.id,'offer',{type:offer.type,sdp:offer.sdp||''});
   setStatus('正在呼叫对方…请保持私信页面打开。');
  }catch(e){
   onError(errText(e));
   if(callRef.current){void db().rpc('sf_dm_call_action',{p_call:callRef.current.id,p_action:'end'});}
   cleanup();
  }finally{setConnecting(false);lockRef.current=false;}
 }
 async function accept(){
  const item=callRef.current;
  if(!item||item.callee_id!==userId||lockRef.current)return;
  lockRef.current=true;setConnecting(true);setStatus('正在申请麦克风权限…');
  try{
   const stream=await getMic();streamRef.current=stream;
   const result=await db().rpc('sf_dm_call_action',{p_call:item.id,p_action:'accept'});
   if(result.error)throw result.error;
   const active={...item,status:'active' as const};callRef.current=active;setCall(active);
   await buildPeer(active,stream);setupRef.current=true;setStatus('正在连接…');
   await consume(item.id);
  }catch(e){onError(errText(e));streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  finally{lockRef.current=false;setConnecting(false)}
 }
 async function finish(decline=false){
  const item=callRef.current;if(!item||closedRef.current)return;
  closedRef.current=true;
  const action=decline?'decline':'end';
  try{const result=await db().rpc('sf_dm_call_action',{p_call:item.id,p_action:action});if(result.error)onError(result.error.message);}
  catch(e){onError(errText(e))}
  finally{cleanup()}
 }
 useEffect(()=>{
  let valid=true;
  // Poll is a fallback when Realtime cannot deliver events (e.g. mobile browsers).
  const poll=async()=>{
   if(document.visibilityState==='hidden')return;
   try{
    const current=callRef.current;
    if(current){
     const result=await db().from('sf_dm_calls').select('id,conversation_id,caller_id,callee_id,status,created_at').eq('id',current.id).maybeSingle();
     if(!valid)return;
     if(result.error||!result.data||['ended','declined'].includes(result.data.status)||
      (result.data.status==='ringing'&&Date.now()-new Date(result.data.created_at).getTime()>180000)){
      cleanup();return;
     }
     if(current.status!==result.data.status){callRef.current=result.data as Call;setCall(result.data as Call);}
     if(setupRef.current&&!startedRef.current){startedRef.current=true;try{await consume(current.id)}finally{startedRef.current=false}}
    }else{
     const response=await db().from('sf_dm_calls')
      .select('id,conversation_id,caller_id,callee_id,status,created_at')
      .eq('callee_id',userId).eq('status','ringing').order('created_at',{ascending:false}).limit(5);
     if(!valid||response.error||callRef.current)return;
     const incoming=(response.data||[]).find(c=>Date.now()-new Date(c.created_at).getTime()<180000);
     if(incoming){callRef.current=incoming as Call;setCall(incoming as Call);setStatus('收到语音通话邀请');}
    }
   }catch{}
  };
  void poll();
  const timer=window.setInterval(()=>{void poll()},1500);
  const resume=()=>{if(document.visibilityState==='visible')void poll()};
  document.addEventListener('visibilitychange',resume);
  return()=>{valid=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',resume)};
 },[userId,cleanup,consume]);
 function toggleMute(){streamRef.current?.getAudioTracks().forEach(t=>{t.enabled=!t.enabled});setMuted(s=>!s)}
 const incoming=call?.callee_id===userId&&call.status==='ringing'&&!setupRef.current;
 return <>
  {conversationId&&peerId&&<button type="button" className="sf-dm-call-launch" onClick={()=>void start()} disabled={!canSend||!!call||connecting} title="发起实时语音通话"><Phone size={19}/><span>语音通话</span></button>}
  {call&&<div className="sf-dm-call-overlay" role="dialog" aria-modal="true" aria-label="星流语音通话">
   <div className="sf-dm-call-dialog">
    <div className="sf-dm-call-icon"><Phone size={26}/></div>
    <h2>{incoming?'收到语音来电':call.status==='ringing'?'正在呼叫…':'星流语音通话'}</h2>
    <p>{status||'连接准备中…'}</p>
    <small>仅会话双方可以接听。通话音频通过 WebRTC 传输，不会自动录音。</small>
    <audio ref={played} autoPlay playsInline controls={remoteReady} aria-label="对方通话声音"/>
    <div className="sf-dm-call-buttons">
     {incoming?<><button type="button" className="sf-dm-accept" onClick={()=>void accept()} disabled={connecting}><Phone size={18}/>接听</button>
      <button type="button" className="sf-dm-decline" onClick={()=>void finish(true)} disabled={connecting}><PhoneOff size={18}/>拒绝</button></>:
      <><button type="button" onClick={toggleMute} disabled={!streamRef.current}>{muted?<MicOff size={18}/>:<Mic size={18}/>} {muted?'取消静音':'静音'}</button>
      <button type="button" className="sf-dm-decline" onClick={()=>void finish()}><PhoneOff size={18}/>挂断</button></>}
    </div>
    {remoteReady&&<button type="button" className="sf-dm-play-remote" onClick={()=>void played.current?.play().catch(()=>onError('请在系统中允许播放音频'))}><Volume2 size={17}/>播放对方声音</button>}
    <p className="sf-dm-call-caveat">系统会优先尝试直连；配置临时 TURN 凭据后可改善跨运营商连接。如果未配置 TURN，部分网络仍会失败。来电提醒仅在私信网页前台提供。</p>
   </div>
  </div>}
 </>;
}
