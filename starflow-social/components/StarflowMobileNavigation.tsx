'use client';
import Link from 'next/link';
import type {CSSProperties} from 'react';
import {useLayoutEffect,useRef,useState} from 'react';
import {useLanguage} from './LanguageProvider';
import {Bell,Compass,Home,Plus,UserRound} from 'lucide-react';
type Props={view:string;profileUrl:string;unread:number;onPublish:()=>void};
export function StarflowMobileNavigation({view,profileUrl,unread,onPublish}:Props){
 const {t}=useLanguage();
 const entries=[
  {href:'/',label:t('home'),icon:Home,active:view==='home'},
  {href:'/explore',label:t('explore'),icon:Compass,active:view==='explore'},
  {href:'/notifications',label:t('notifications'),icon:Bell,active:view==='notifications'},
  {href:profileUrl,label:t('profile'),icon:UserRound,active:view==='profile'},
 ];
 const activeSlot=view==='home'?0:view==='explore'?1:view==='notifications'?3:view==='profile'?4:-1;
 const [indicatorSlot,setIndicatorSlot]=useState(Math.max(0,activeSlot));
 const rafs=useRef<number[]>([]);
 // Next pages mount their own nav instances; persist the previous slot so a
 // new page can animate from it rather than snapping the selection into place.
 useLayoutEffect(()=>{
  rafs.current.forEach(id=>window.cancelAnimationFrame(id));
  rafs.current=[];
  if(activeSlot<0)return;
  try{
   const raw=window.sessionStorage.getItem('sf2-last-nav-slot');
   const from=raw?JSON.parse(raw) as {slot:number;at:number}:null;
   if(from && Number.isInteger(from.slot) && from.slot>=0 && from.slot<=4
      && from.slot!==activeSlot && Date.now()-from.at<7000){
    setIndicatorSlot(from.slot);
    const first=window.requestAnimationFrame(()=>{
     const second=window.requestAnimationFrame(()=>setIndicatorSlot(activeSlot));
     rafs.current.push(second);
    });
    rafs.current.push(first);
   }else setIndicatorSlot(activeSlot);
  }catch{setIndicatorSlot(activeSlot)}
  try{window.sessionStorage.setItem('sf2-last-nav-slot',JSON.stringify({slot:activeSlot,at:Date.now()}))}catch{}
  return()=>{rafs.current.forEach(id=>window.cancelAnimationFrame(id));rafs.current=[]};
 },[activeSlot]);
 const markNavigation=()=>{
  if(activeSlot<0)return;
  try{window.sessionStorage.setItem('sf2-last-nav-slot',JSON.stringify({slot:activeSlot,at:Date.now()}))}catch{}
 };
 const render=(item:typeof entries[number])=>{
  const Icon=item.icon;
  return <Link key={item.href} href={item.href} className={'sf-mobile-tab'+(item.active?' is-selected':'')}
   aria-current={item.active?'page':undefined} aria-label={item.label} onClick={markNavigation}>
   <Icon size={22} strokeWidth={item.active?2.6:1.8}/><span>{item.label}</span>
   {item.href==='/notifications'&&unread>0&&<i className="sf-mobile-unread"/>}
  </Link>;
 };
 return <nav className="sf-mobile-five-nav" aria-label="星流手机主导航"
  data-has-active={activeSlot>=0?'true':'false'}
  style={{'--sf2-active-slot':indicatorSlot} as CSSProperties}>
  {entries.slice(0,2).map(render)}
  <button type="button" className="sf-mobile-publish-button" aria-label="发布新动态"
   title="发布新动态" onClick={onPublish}><Plus size={30} strokeWidth={2.9}/></button>
  {entries.slice(2).map(render)}
 </nav>;
}
