'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {type Lang,type TranslationKey,LANGUAGE_OPTIONS,translate} from '@/lib/i18n';
import './LanguageSwitch.css';

const LanguageContext=createContext<{lang:Lang;setLang:(lang:Lang)=>void;t:(key:TranslationKey)=>string}>({
 lang:'zh',setLang:()=>{},t:key=>translate('zh',key)
});
export function LanguageProvider({children}:{children:React.ReactNode}){
 const [lang,setLanguage]=useState<Lang>('zh');
 useEffect(()=>{
  try{
   const previous=window.localStorage.getItem('sf-language');
   if(LANGUAGE_OPTIONS.some(option=>option.code===previous))setLanguage(previous as Lang);
  }catch{/* storage unavailable: fall back to simplified Chinese */}
 },[]);
 useEffect(()=>{
  const locale=LANGUAGE_OPTIONS.find(option=>option.code===lang);
  document.documentElement.lang=locale?.htmlLang??'zh-CN';
  try{window.localStorage.setItem('sf-language',lang)}catch{/* private mode */}
 },[lang]);
 const setLang=useCallback((value:Lang)=>setLanguage(value),[]);
 return <LanguageContext.Provider value={{lang,setLang,t:(key)=>translate(lang,key)}}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){return useContext(LanguageContext)}

export function LanguageSwitch({className=''}:{className?:string}){
 const {lang,setLang}=useLanguage();
 const [open,setOpen]=useState(false);
 const container=useRef<HTMLDivElement>(null);
 const options=useRef<(HTMLButtonElement|null)[]>([]);
 const current=LANGUAGE_OPTIONS.findIndex(item=>item.code===lang);
 const selected=LANGUAGE_OPTIONS[current]??LANGUAGE_OPTIONS[0];
 useEffect(()=>{
  if(!open)return;
  const closeOutside=(event:PointerEvent)=>{
   if(!container.current?.contains(event.target as Node))setOpen(false);
  };
  const closeEscape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);container.current?.querySelector<HTMLButtonElement>('.sf-lang-switch')?.focus();}
  };
  document.addEventListener('pointerdown',closeOutside);
  document.addEventListener('keydown',closeEscape);
  return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',closeEscape);};
 },[open]);
 const choose=(value:Lang)=>{setLang(value);setOpen(false);container.current?.querySelector<HTMLButtonElement>('.sf-lang-switch')?.focus();};
 const onKeys=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(!open)return;
  const active=options.current.findIndex(el=>el===document.activeElement);
  const target=active<0?Math.max(0,current):active;
  let next:number|undefined;
  if(event.key==='ArrowDown')next=(target+1)%LANGUAGE_OPTIONS.length;
  if(event.key==='ArrowUp')next=(target-1+LANGUAGE_OPTIONS.length)%LANGUAGE_OPTIONS.length;
  if(event.key==='Home')next=0;
  if(event.key==='End')next=LANGUAGE_OPTIONS.length-1;
  if(next!==undefined){event.preventDefault();options.current[next]?.focus();}
 };
 return <div ref={container} className={'sf-lang-control '+className} onKeyDown={onKeys}>
  <button className="sf-lang-switch" type="button" aria-label={'语言 / Language: '+selected.label}
   aria-haspopup="menu" aria-expanded={open} title="语言 / Language"
   onClick={()=>setOpen(value=>!value)}>
   <span className="sf-lang-flag" aria-hidden="true">{selected.flag}</span>
   <span className="sf-lang-current">{selected.shortLabel}</span>
   <span className={'sf-lang-arrow'+(open?' sf-lang-open':'')} aria-hidden="true">⌄</span>
  </button>
  {open&&<div className="sf-lang-menu" role="menu" aria-label="选择语言 / Select language">
   <div className="sf-lang-menu-heading">语言 / LANGUAGE</div>
   {LANGUAGE_OPTIONS.map((item,index)=><button key={item.code} ref={el=>{options.current[index]=el}}
     className={'sf-lang-option'+(item.code===lang?' sf-lang-selected':'')}
     type="button" role="menuitemradio" aria-checked={item.code===lang}
     lang={item.htmlLang} onClick={()=>choose(item.code)}>
     <span className="sf-lang-option-flag" aria-hidden="true">{item.flag}</span>
     <span className="sf-lang-option-label">{item.label}<small>{item.description}</small></span>
     <span className="sf-lang-option-check" aria-hidden="true">{item.code===lang?'✓':''}</span>
    </button>)}
  </div>}
 </div>;
}
