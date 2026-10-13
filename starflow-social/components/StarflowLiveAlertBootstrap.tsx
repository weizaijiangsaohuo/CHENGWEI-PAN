'use client';
import {useEffect,useState} from 'react';
import {db,hasConfig} from '@/lib/supabase';
import Link from 'next/link';
import type {RealtimeChannel} from '@supabase/supabase-js';

// Foreground-only Realtime notification alerts. This is not background Web Push.
export function StarflowLiveAlertBootstrap(){
 const [toast,setToast]=useState(false);
 useEffect(()=>{
  if(!hasConfig())return;
  let active=true;
  let channel:RealtimeChannel|null=null;
  const client=db();
  const close=()=>{if(channel){void client.removeChannel(channel);channel=null;}};
  const start=async()=>{
   close();
   const {data:{user},error}=await client.auth.getUser();
   if(!active||error||!user)return;
   let enabled=false;
   try{enabled=localStorage.getItem('sf-live-alerts-enabled:'+user.id)==='true';}catch{}
   if(!enabled)return;
   channel=client.channel('sf-live-alerts-'+user.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_id=eq.'+user.id},()=>{
     if(!active)return;
     setToast(true);
     // The system notification must never contain DM text or private profile data.
     if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{
       const notice=new Notification('星流 Starflow',{body:'你收到了新的互动或站内通知',tag:'sf-live-alert'});
       notice.onclick=()=>{window.focus();window.location.assign('/notifications');notice.close();};
      }catch{/* OS notifications may be blocked even after permission. */}
     }
    }).subscribe();
  };
  void start();
  const changed=()=>{if(active)void start();};
  window.addEventListener('sf-alert-pref-updated',changed);
  const {data:{subscription}}=client.auth.onAuthStateChange(()=>{
   // Supabase auth callbacks must not synchronously await another auth API.
   queueMicrotask(changed);
  });
  return()=>{active=false;close();subscription.unsubscribe();window.removeEventListener('sf-alert-pref-updated',changed);};
 },[]);
 if(!toast)return null;
 return <div role="status" aria-live="polite" style={{
  position:'fixed',bottom:88,left:14,zIndex:190,width:'min(360px,calc(100vw - 28px))',
  background:'#fff',color:'#302446',border:'1px solid #d9ccea',borderRadius:15,
  boxShadow:'0 12px 38px rgba(35,21,70,.18)',padding:'12px 16px',
  display:'flex',alignItems:'center',gap:10,fontSize:14
 }}>
  <Link href="/notifications" onClick={()=>setToast(false)} style={{flex:1,color:'#6340b3',fontWeight:650}}>✦ 你有新的互动通知 · 点击查看</Link>
  <button type="button" onClick={()=>setToast(false)} aria-label="关闭提示" style={{border:0,background:'transparent',color:'#716883',fontSize:20}}>×</button>
 </div>;
}
