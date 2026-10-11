'use client';
import Link from 'next/link';
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
 const render=(item:typeof entries[number])=>{
  const Icon=item.icon;
  return <Link key={item.href} href={item.href} className={'sf-mobile-tab'+(item.active?' is-selected':'')}
   aria-current={item.active?'page':undefined} aria-label={item.label}>
   <Icon size={22} strokeWidth={item.active?2.6:1.8}/><span>{item.label}</span>
   {item.href==='/notifications'&&unread>0&&<i className="sf-mobile-unread"/>}
  </Link>;
 };
 return <nav className="sf-mobile-five-nav" aria-label="星流手机主导航">
  {entries.slice(0,2).map(render)}
  <button type="button" className="sf-mobile-publish-button" aria-label="发布新动态"
   title="发布新动态" onClick={onPublish}><Plus size={30} strokeWidth={2.9}/></button>
  {entries.slice(2).map(render)}
 </nav>;
}
