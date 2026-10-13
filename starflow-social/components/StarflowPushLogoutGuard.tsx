'use client';
import {useEffect} from 'react';
import {db,hasConfig} from '@/lib/supabase';

// Unsubscribe the browser locally immediately when its Starflow account signs out.
// Old database rows may remain until the Web Push gateway returns 404/410; the
// endpoint is invalidated locally and queued messages never contain private text.
export function StarflowPushLogoutGuard(){
 useEffect(()=>{
  if(!hasConfig()||!('serviceWorker' in navigator))return;
  const {data:{subscription}}=db().auth.onAuthStateChange(event=>{
   if(event!=='SIGNED_OUT')return;
   queueMicrotask(()=>{
    void navigator.serviceWorker.getRegistration().then(async registration=>{
     const push=await registration?.pushManager.getSubscription();
     if(push)await push.unsubscribe();
    }).catch(()=>{});
   });
  });
  return()=>subscription.unsubscribe();
 },[]);
 return null;
}
