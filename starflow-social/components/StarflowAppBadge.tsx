'use client';
import {useEffect} from 'react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {db,hasConfig} from '@/lib/supabase';

type BadgingNavigator=Navigator&{
 setAppBadge?: (number?:number)=>Promise<void>;
 clearAppBadge?:()=>Promise<void>;
};
// Badges are based solely on the current authenticated user's unread notification count.
// No private notifications are cached, shared between accounts or shown in badge text.
export function StarflowAppBadge(){
 useEffect(()=>{
  if(!hasConfig()||typeof navigator==='undefined')return;
  const browser=navigator as BadgingNavigator;
  if(typeof browser.setAppBadge!=='function'||typeof browser.clearAppBadge!=='function')return;
  const client=db();
  let alive=true,epoch=0,channel:RealtimeChannel|null=null,currentUser='';
  const clear=()=>{void browser.clearAppBadge?.().catch(()=>{});};
  const close=()=>{if(channel){void client.removeChannel(channel);channel=null;}};
  const fetchCount=async(userId:string)=>{
   const id=epoch;
   if(!alive||!userId||currentUser!==userId)return;
   try{
    const {count,error}=await client.from('notifications').select('id',{head:true,count:'exact'})
     .eq('recipient_id',userId).is('read_at',null);
    if(error||!alive||id!==epoch||currentUser!==userId)return;
    // Zero clears the badge. Cap the icon counter to avoid giant unsupported labels.
    if((count||0)<=0)clear();
    else void browser.setAppBadge?.(Math.min(99,count||0)).catch(()=>{});
   }catch{/* Badging support is best-effort, never blocks notifications. */}
  };
  const start=async()=>{
   const id=++epoch;
   close();
   try{
    const {data:{user},error}=await client.auth.getUser();
    if(!alive||id!==epoch)return;
    if(error||!user){currentUser='';clear();return;}
    currentUser=user.id;
    void fetchCount(user.id);
    channel=client.channel('sf-app-badge-'+user.id)
     .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'recipient_id=eq.'+user.id},
      ()=>{if(alive)void fetchCount(user.id)})
     .subscribe();
   }catch{if(alive&&id===epoch){currentUser='';clear();}}
  };
  void start();
  const visibility=()=>{if(!document.hidden&&currentUser)void fetchCount(currentUser)};
  document.addEventListener('visibilitychange',visibility);
  const timer=window.setInterval(()=>{if(!document.hidden&&currentUser)void fetchCount(currentUser)},90_000);
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'){++epoch;currentUser='';close();clear();return;}
   if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')queueMicrotask(()=>{if(alive)void start()});
  });
  return()=>{
   alive=false;++epoch;close();window.clearInterval(timer);
   document.removeEventListener('visibilitychange',visibility);
   subscription.unsubscribe();
  };
 },[]);
 return null;
}
