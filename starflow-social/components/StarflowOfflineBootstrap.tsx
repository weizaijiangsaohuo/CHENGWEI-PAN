'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
// Service worker explicitly caches PUBLIC hashed scripts and a generic fallback only.
export function StarflowOfflineBootstrap(){
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  setOffline(!navigator.onLine);
  const on=()=>setOffline(false),off=()=>setOffline(true);
  window.addEventListener('online',on);
  window.addEventListener('offline',off);
  if('serviceWorker' in navigator && window.isSecureContext){
   // Register a same-origin worker; no permission prompt and no private cache.
   void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  }
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
 },[]);
 if(!offline)return null;
 return <div role="status" aria-live="polite" style={{position:'fixed',top:0,left:0,right:0,zIndex:220,background:'#312551',color:'white',padding:'9px 14px',textAlign:'center',fontSize:13}}>
  当前设备已离线，互动和发布需要网络。<Link href="/offline" style={{color:'#f0dbff',marginLeft:8}}>查看说明</Link>
 </div>;
}
