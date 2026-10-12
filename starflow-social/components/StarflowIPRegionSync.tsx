'use client';
import {useEffect} from 'react';
import type {Session} from '@supabase/supabase-js';
import {db,hasConfig} from '@/lib/supabase';

// This is an opt-in-at-platform level feature: SQL rollout is disabled by default.
// It must never send a user's raw IP, GPS, or client-provided country.
export function StarflowIPRegionSync(){
 useEffect(()=>{
  if(!hasConfig())return;
  const client=db();
  let active=true;
  const record=async(session:Session|null)=>{
   if(!active||!session?.access_token||!session.user?.id)return;
   const storageKey='sf-ip-region-check:'+session.user.id;
   const now=Date.now();
   try{
    const checked=Number(window.sessionStorage.getItem(storageKey)||'0');
    if(now-checked<12*60*60*1000)return;
    window.sessionStorage.setItem(storageKey,String(now));
   }catch{/* Private browsing may disable session storage. */}
   try{
    await fetch('/api/account/ip-region',{
     method:'POST',headers:{Authorization:'Bearer '+session.access_token},
     credentials:'same-origin',cache:'no-store',body:'{}'
    });
   }catch{/* Offline clients should retain their ordinary social features. */}
  };
  void client.auth.getSession().then(({data})=>void record(data.session)).catch(()=>{});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
   // Don't perform async Supabase work from inside the auth-state callback.
   queueMicrotask(()=>void record(session));
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 return null;
}
