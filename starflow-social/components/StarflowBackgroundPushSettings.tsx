'use client';
import {useEffect,useState} from 'react';
import {db} from '@/lib/supabase';
const publicKey=process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()||'';
function decodeKey(value:string):Uint8Array<ArrayBuffer>{
 const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
 const binary=atob(padded);
 const arr=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)arr[i]=binary.charCodeAt(i);
 return arr;
}
const standalone=()=>typeof window!=='undefined'&&(
 window.matchMedia('(display-mode: standalone)').matches||
 Boolean((navigator as Navigator&{standalone?:boolean}).standalone)
);
export function StarflowBackgroundPushSettings({userId}:{userId:string}){
 const [supported,setSupported]=useState(false);
 const [installed,setInstalled]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [devices,setDevices]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const configured=publicKey.length>0;
 useEffect(()=>{
  let alive=true;
  const capable=('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window)
   &&window.isSecureContext;
  setSupported(capable);
  setInstalled(standalone());
  if(!capable)return;
  (async()=>{
   try{
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(subscription){
     const {data:owned,error:ownerError}=await db().rpc('sf_web_push_device_registered',{p_endpoint:subscription.endpoint});
     // Avoid delivering a previous account's pushes on shared iPhones.
     if(!ownerError&&owned!==true){
      await subscription.unsubscribe().catch(()=>{});
      subscription=null;
     }
    }
    const {data,error:e}=await db().rpc('sf_web_push_subscription_count');
    if(alive){setEnabled(Boolean(subscription));setDevices(e?null:Number(data||0));}
   }catch{/* A browser without a push provider may reject silently. */}
  })();
  return()=>{alive=false;};
 },[userId]);
 async function toggle(next:boolean){
  if(busy||!supported||(next&&!configured))return;
  setBusy(true);setNotice('');setError('');
  try{
   const {data:{user},error:authError}=await db().auth.getUser();
   if(authError||user?.id!==userId)throw Error('登录状态已变化，请重新登录');
   const registration=await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(next){
    if(Notification.permission==='default'){
     const permission=await Notification.requestPermission();
     if(permission!=='granted')throw Error('未获得浏览器通知权限');
    }
    if(Notification.permission!=='granted')throw Error('浏览器通知权限未开启');
    let created=false;
    if(!subscription){
     subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)
     });
     created=true;
    }
    const json=subscription.toJSON();
    if(!json.endpoint||!json.keys?.p256dh||!json.keys?.auth)throw Error('浏览器未生成完整推送订阅');
    const {error:e}=await db().rpc('sf_register_web_push',{
     p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth
    });
    if(e){if(created)await subscription.unsubscribe().catch(()=>{});throw e;}
    setEnabled(true);setNotice('已登记本设备的后台推送。真正收取通知还需要服务器投递服务运行。');
   }else{
    if(subscription){
     const {error:e}=await db().rpc('sf_unsubscribe_web_push',{p_endpoint:subscription.endpoint});
     if(e)throw e;
     await subscription.unsubscribe();
    }
    setEnabled(false);setNotice('已关闭本设备推送订阅。');
   }
   const {data:count}=await db().rpc('sf_web_push_subscription_count');
   setDevices(typeof count==='number'?count:null);
  }catch(e){setError(e instanceof Error?e.message:'推送设置失败，请检查设备和浏览器权限');}
  finally{setBusy(false);}
 }
 return <section className="sf-growth-card" aria-label="后台推送通知">
  <h2>手机后台推送（Web Push）</h2>
  <p className="sf-growth-note">支持的设备可在关闭页面后收到通用系统通知。仅推送“你有新的站内通知”，不会把私信正文或个人资料发给推送服务商。</p>
  {!supported?<p role="status">当前浏览器不支持 Web Push，或网站不是安全 HTTPS 环境。</p>:
  !installed&&/iPhone|iPad|iPod/.test(navigator.userAgent)?<p role="status">在 iPhone 上，请先通过 Safari「分享 → 添加到主屏幕」，再从主屏幕打开星流。</p>:
  !configured?<div><p role="status">服务器尚未配置 Web Push VAPID 公钥和加密投递服务，暂时不能开启新订阅。原有站内通知继续可用。</p>
   {enabled&&<button type="button" disabled={busy} onClick={()=>void toggle(false)}>取消本设备旧订阅</button>}
  </div>:
  <>
   <p>本设备：<strong>{enabled?'已订阅':'未订阅'}</strong>{devices!==null?' · 当前账号登记了 '+devices+' 台设备':''}</p>
   <div className="sf-growth-actions">
    <button type="button" disabled={busy||enabled} onClick={()=>void toggle(true)}>{busy?'处理中…':'开启本设备后台推送'}</button>
    <button type="button" className="secondary" disabled={busy||!enabled} onClick={()=>void toggle(false)}>关闭本设备推送</button>
   </div>
  </>}
  {error&&<p role="alert" className="sf-growth-error">{error}</p>}
  {notice&&<p role="status" className="sf-growth-notice">{notice}</p>}
  <p className="sf-growth-note">网页内实时提醒、PWA 图标角标与后台推送是独立功能。推送到达时间还取决于设备系统、网络及浏览器限制。</p>
 </section>;
}
