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
  const inFlight=new Set<string>();
  const record=async(session:Session|null)=>{
   if(!active||!session?.access_token||!session.user?.id)return;
   const userId=session.user.id;
   if(inFlight.has(userId))return;
   // A previous attempt made while the policy was disabled or the network was
   // unavailable must not suppress the first real capture after activation.
   const storageKey='sf-ip-region-saved-v2:'+userId;
   const now=Date.now();
   try{
    const savedAt=Number(window.sessionStorage.getItem(storageKey)||'0');
    if(now-savedAt<12*60*60*1000)return;
   }catch{/* Private browsing may disable session storage. */}
   inFlight.add(userId);
   try{
    const response=await fetch('/api/account/ip-region',{
     method:'POST',headers:{Authorization:'Bearer '+session.access_token},
     credentials:'same-origin',cache:'no-store',body:'{}'
    });
    if(!response.ok)return;
    const result=await response.json() as {enabled?:boolean;saved?:boolean};
    if(!active||result.enabled!==true||result.saved!==true)return;
    try{window.sessionStorage.setItem(storageKey,String(Date.now()));}catch{}
   }catch{/* Offline clients should retain their ordinary social features. */}
   finally{inFlight.delete(userId);}
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
