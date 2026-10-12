'use client';
import {useEffect,useState} from 'react';
import {MonitorSmartphone,CheckCircle2,AlertCircle} from 'lucide-react';

type Capabilities={secure:boolean;microphone:boolean;recorder:boolean;call:boolean;dictation:boolean;location:boolean};
function detect():Capabilities{
 const browser=window as typeof window & {SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown};
 const microphone=Boolean(navigator.mediaDevices?.getUserMedia);
 let recorder=false;
 if(typeof MediaRecorder!=='undefined') {
  try{recorder=['audio/mp4','audio/webm','audio/webm;codecs=opus','audio/ogg;codecs=opus']
   .some(type=>MediaRecorder.isTypeSupported(type));}catch{}
 }
 return {
  secure:window.isSecureContext,
  microphone,recorder,call:typeof RTCPeerConnection!=='undefined'&&microphone,
  dictation:Boolean(browser.SpeechRecognition||browser.webkitSpeechRecognition),
  location:Boolean(navigator.geolocation)
 };
}
export function StarflowMediaCapability(){
 const [caps,setCaps]=useState<Capabilities|null>(null);
 useEffect(()=>{setCaps(detect())},[]);
 if(!caps)return null;
 const features=[
  ['麦克风授权',caps.secure&&caps.microphone],
  ['录制语音',caps.secure&&caps.microphone&&caps.recorder],
  ['网页语音识别',caps.dictation],
  ['一对一语音通话',caps.secure&&caps.call],
  ['位置共享',caps.secure&&caps.location]
 ] as const;
 return <details className="sf-dm-device-check">
  <summary><MonitorSmartphone size={15}/> 设备与浏览器兼容性</summary>
  <div className="sf-dm-device-list">
   {features.map(([title,ok])=><span key={title}>
    {ok?<CheckCircle2 size={15} aria-label="具备浏览器接口"/>:<AlertCircle size={15} aria-label="缺少浏览器接口"/>}
    {title}<small>{ok?'浏览器支持接口':'需要兼容的浏览器或系统功能'}</small>
   </span>)}
  </div>
  {!caps.secure&&<p>麦克风与定位必须在 HTTPS 安全页面使用。</p>}
  {!caps.dictation&&<p>网页语音识别不可用时，可点击文本输入框，使用 iOS、Android、Windows 或 macOS 系统键盘的语音输入。</p>}
  {!caps.recorder&&<p>当前浏览器不能直接录制语音，可尝试使用设备已有的音频文件发送。</p>}
  <p>检查结果只说明浏览器提供相关接口，不保证麦克风权限、音频设备或两端网络连接成功。来电提醒需保持私信网页处于前台。</p>
 </details>;
}
