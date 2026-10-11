'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {BarChart3,BookOpen,ChevronDown,Compass,HeartHandshake,LockKeyhole,Menu,MessageCircle,Settings2,ShieldCheck,UserRound,Users,X} from 'lucide-react';
import {useLanguage} from './LanguageProvider';
import type {Lang} from '@/lib/i18n';
import './StarflowMoreMenu.css';

type MenuCopy={more:string;links:string;community:string;creator:string;support:string;guidelines:string;privacy:string;settings:string;reduce:string;compact:string;reduceHint:string;compactHint:string;profile:string};
const en:MenuCopy={more:'More',links:'Discover more',community:'Community & Lists',creator:'Creator analytics',support:'AI customer support',guidelines:'Community guidelines',privacy:'Privacy & data',settings:'Settings',reduce:'Reduce motion',compact:'Compact layout',reduceHint:'Fewer visual effects',compactHint:'Smaller spacing in the feed',profile:'Your profile'};
const translations:Record<string,MenuCopy>={
  en,'en-sg':en,'en-gb':en,
  zh:{more:'更多',links:'更多服务',community:'社区 / 列表',creator:'创作者数据',support:'AI 客服中心',guidelines:'社区规范',privacy:'隐私与数据',settings:'设置',reduce:'减少动效',compact:'紧凑布局',reduceHint:'减少过渡及动态效果',compactHint:'缩小信息流间距',profile:'个人主页'},
  'zh-hk':{more:'更多',links:'更多服務',community:'社群 / 列表',creator:'創作者數據',support:'AI 客服中心',guidelines:'社群守則',privacy:'私隱與資料',settings:'設定',reduce:'減少動效',compact:'緊湊版面',reduceHint:'減少動畫與轉場',compactHint:'縮小資訊流間距',profile:'個人主頁'},
  ja:{more:'もっと見る',links:'その他のサービス',community:'コミュニティ / リスト',creator:'クリエイター分析',support:'AIサポート',guidelines:'コミュニティガイドライン',privacy:'プライバシー',settings:'設定',reduce:'動きを減らす',compact:'コンパクト表示',reduceHint:'動きのある演出を減らす',compactHint:'フィードの余白を縮める',profile:'プロフィール'},
  ko:{more:'더 보기',links:'더 많은 서비스',community:'커뮤니티 / 목록',creator:'크리에이터 분석',support:'AI 고객지원',guidelines:'커뮤니티 가이드라인',privacy:'개인정보 보호',settings:'설정',reduce:'동작 줄이기',compact:'간결한 레이아웃',reduceHint:'화면 효과 최소화',compactHint:'피드 간격 줄이기',profile:'프로필'},
  de:{more:'Mehr',links:'Weitere Angebote',community:'Community & Listen',creator:'Creator-Statistiken',support:'KI-Support',guidelines:'Community-Richtlinien',privacy:'Datenschutz',settings:'Einstellungen',reduce:'Animationen reduzieren',compact:'Kompakte Ansicht',reduceHint:'Weniger Animationen',compactHint:'Kleinere Abstände im Feed',profile:'Profil'},
  fr:{more:'Plus',links:'Autres services',community:'Communauté & listes',creator:'Statistiques créateur',support:'Assistance IA',guidelines:'Règles de la communauté',privacy:'Confidentialité',settings:'Paramètres',reduce:'Réduire les animations',compact:'Affichage compact',reduceHint:'Moins d’effets visuels',compactHint:'Réduire les espaces du fil',profile:'Profil'}
};
export function StarflowMoreMenu({profileHref}:{profileHref:string}){
  const {lang}=useLanguage();
  const locale=lang.toLowerCase();
  const localeKey=locale.startsWith('ja')?'ja':locale.startsWith('ko')?'ko':locale.startsWith('de')?'de':locale.startsWith('fr')?'fr':locale;
  const c=translations[localeKey]??en;
  const [open,setOpen]=useState(false);
  const [reduce,setReduce]=useState(false);
  const [compact,setCompact]=useState(false);
  const root=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    let mediaReduced=false;
    try{
      mediaReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setReduce(mediaReduced||localStorage.getItem('sf-site-reduced-motion')==='true');
      setCompact(localStorage.getItem('sf-site-compact')==='true');
    }catch{}
  },[]);
  useEffect(()=>{
    document.documentElement.classList.toggle('sf-social-reduced',reduce);
    return()=>document.documentElement.classList.remove('sf-social-reduced');
  },[reduce]);
  useEffect(()=>{
    document.documentElement.classList.toggle('sf-social-compact',compact);
    return()=>document.documentElement.classList.remove('sf-social-compact');
  },[compact]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[open]);
  function setPreference(key:string,value:boolean){
    try{localStorage.setItem(key,String(value))}catch{}
  }
  return <div className="sf-more-anchor" ref={root}>
    <button className="sf-more-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={c.more} onClick={()=>setOpen(v=>!v)}>
      <Menu size={19}/><span>{c.more}</span><ChevronDown size={13}/>
    </button>
    {open&&<div className="sf-more-popover" role="menu" aria-label={c.more}>
      <div className="sf-more-title"><span>{c.links}</span><button type="button" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button></div>
      <div className="sf-more-links">
        <Link role="menuitem" href={profileHref} onClick={()=>setOpen(false)}><UserRound size={18}/>{c.profile}</Link>
        <Link role="menuitem" href="/hub" onClick={()=>setOpen(false)}><Users size={18}/>{c.community}</Link>
        <Link role="menuitem" href="/creator" onClick={()=>setOpen(false)}><BarChart3 size={18}/>{c.creator}</Link>
        <Link role="menuitem" href="/support" onClick={()=>setOpen(false)}><MessageCircle size={18}/>{c.support}</Link>
        <Link role="menuitem" href="/guidelines" onClick={()=>setOpen(false)}><ShieldCheck size={18}/>{c.guidelines}</Link>
        <Link role="menuitem" href="/privacy" onClick={()=>setOpen(false)}><LockKeyhole size={18}/>{c.privacy}</Link>
        <Link role="menuitem" href="/settings" onClick={()=>setOpen(false)}><Settings2 size={18}/>{c.settings}</Link>
      </div>
      <div className="sf-more-preferences">
        <label><span><strong>{c.reduce}</strong><small>{c.reduceHint}</small></span><input type="checkbox" checked={reduce} onChange={e=>{setReduce(e.target.checked);setPreference('sf-site-reduced-motion',e.target.checked)}}/></label>
        <label><span><strong>{c.compact}</strong><small>{c.compactHint}</small></span><input type="checkbox" checked={compact} onChange={e=>{setCompact(e.target.checked);setPreference('sf-site-compact',e.target.checked)}}/></label>
      </div>
    </div>}
  </div>;
}
