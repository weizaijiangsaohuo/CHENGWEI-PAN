'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {type Lang,type TranslationKey,translate} from '@/lib/i18n';

type Option = {code:Lang;name:string;region:string;flag:string;htmlLang:string};
export const languageOptions:readonly Option[]=[
  {code:'zh',name:'简体中文',region:'中国大陆',flag:'🇨🇳',htmlLang:'zh-CN'},
  {code:'en',name:'English (US)',region:'United States',flag:'🇺🇸',htmlLang:'en-US'},
  {code:'zh-hk',name:'繁體中文',region:'香港',flag:'🇭🇰',htmlLang:'zh-HK'},
  {code:'ko',name:'한국어',region:'대한민국',flag:'🇰🇷',htmlLang:'ko-KR'},
  {code:'ja',name:'日本語',region:'日本',flag:'🇯🇵',htmlLang:'ja-JP'},
  {code:'en-sg',name:'English (SG)',region:'Singapore',flag:'🇸🇬',htmlLang:'en-SG'},
  {code:'en-gb',name:'English (UK)',region:'United Kingdom',flag:'🇬🇧',htmlLang:'en-GB'},
  {code:'de',name:'Deutsch',region:'Deutschland',flag:'🇩🇪',htmlLang:'de-DE'},
  {code:'fr',name:'Français',region:'France',flag:'🇫🇷',htmlLang:'fr-FR'}
];
const validLanguage=(value:string|null):value is Lang=>languageOptions.some(item=>item.code===value);
const LanguageContext=createContext<{lang:Lang;setLang:(lang:Lang)=>void;t:(key:TranslationKey)=>string}>({lang:'zh',setLang:()=>{},t:key=>translate('zh',key)});

export function LanguageProvider({children}:{children:React.ReactNode}){
  const [lang,setLanguage]=useState<Lang>('zh');
  const [restored,setRestored]=useState(false);
  useEffect(()=>{
    try{
      const previous=window.localStorage.getItem('sf-language');
      if(validLanguage(previous))setLanguage(previous);
    }catch{}
    setRestored(true);
  },[]);
  useEffect(()=>{
    const option=languageOptions.find(item=>item.code===lang);
    document.documentElement.lang=option?.htmlLang??'zh-CN';
    if(!restored)return;
    try{window.localStorage.setItem('sf-language',lang)}catch{}
  },[lang,restored]);
  const setLang=useCallback((value:Lang)=>{if(validLanguage(value))setLanguage(value)},[]);
  return <LanguageContext.Provider value={{lang,setLang,t:(key)=>translate(lang,key)}}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){return useContext(LanguageContext)}
export function LanguageSwitch({className=''}:{className?:string}){
  const {lang,setLang}=useLanguage();
  const [open,setOpen]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const chosen=languageOptions.find(item=>item.code===lang)??languageOptions[0];
  useEffect(()=>{
    if(!open)return;
    const onOutside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!rootRef.current?.contains(event.target))setOpen(false);
    };
    const onEscape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);rootRef.current?.querySelector('button')?.focus()}};
    document.addEventListener('pointerdown',onOutside);
    document.addEventListener('keydown',onEscape);
    const current=menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    current?.focus();
    return()=>{document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onEscape)};
  },[open]);
  function menuKeys(event:ReactKeyboardEvent<HTMLDivElement>){
    if(!open||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')??[]);
    if(!items.length)return;
    event.preventDefault();
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:
      event.key==='ArrowDown'?(current+1)%items.length:(current+items.length-1)%items.length;
    items[next].focus();
  }
  return <div className={`sf-lang-dropdown ${className}`} ref={rootRef} onKeyDown={menuKeys}>
    <button className="sf-lang-switch" type="button" aria-label="Language / 语言" aria-haspopup="menu" aria-expanded={open}
      onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();setOpen(true)}}}>
      <span aria-hidden="true">{chosen.flag}</span><span className="sf-lang-caption">{chosen.name}</span>
      <span className="sf-lang-arrow" aria-hidden="true">{open?'⌃':'⌄'}</span>
    </button>
    {open&&<div className="sf-lang-menu" role="menu" aria-label="语言 / Language" ref={menuRef}>
      <div className="sf-lang-heading">语言 / LANGUAGE</div>
      {languageOptions.map(option=><button key={option.code} type="button" role="menuitemradio"
        aria-checked={lang===option.code} lang={option.htmlLang}
        className={`sf-lang-option ${lang===option.code?'selected':''}`}
        onClick={()=>{setLang(option.code);setOpen(false)}}>
        <span className="sf-lang-flag" aria-hidden="true">{option.flag}</span>
        <span className="sf-lang-text"><strong>{option.name}</strong><small>{option.region}</small></span>
        {lang===option.code&&<span className="sf-lang-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>}
    <style jsx>{`
      .sf-lang-dropdown{position:relative;display:inline-flex;min-width:0;isolation:isolate}
      .sf-lang-switch{display:inline-flex;align-items:center;gap:9px;padding:11px 15px;border-radius:999px;border:1px solid rgba(163,123,182,.24);background:rgba(255,255,255,.82);color:#44364d;box-shadow:0 6px 24px #946ab51b;white-space:nowrap;cursor:pointer;font-weight:750}
      .sf-lang-arrow{color:#936aab;font-size:14px}
      .sf-lang-menu{position:absolute;top:calc(100% + 9px);right:0;z-index:300;width:min(360px,calc(100vw - 24px));max-height:min(65dvh,590px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border:1px solid #eedcf3;border-radius:25px;background:rgba(255,255,255,.98);box-shadow:0 24px 65px #57406938;padding:13px;scrollbar-width:thin}
      .sf-lang-heading{font-size:11px;font-weight:900;letter-spacing:.18em;color:#9675a8;padding:11px 14px 15px}
      .sf-lang-option{display:flex;align-items:center;gap:14px;text-align:left;width:100%;padding:13px 15px;min-height:65px;border:0;border-radius:17px;background:transparent;color:#392e47;cursor:pointer}
      .sf-lang-option:hover,.sf-lang-option:focus-visible{background:#f9effa}
      .sf-lang-option.selected{background:linear-gradient(110deg,#fae8f5,#eee8ff)}
      .sf-lang-flag{font-size:23px;width:33px;text-align:center;flex:none}
      .sf-lang-text{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}
      .sf-lang-text strong{font-size:14px}.sf-lang-text small{color:#8b8391;font-size:11px}
      .sf-lang-check{color:#9861cb;font-size:20px;font-weight:900}
      @media(max-width:650px){.sf-lang-switch{padding:9px 11px;gap:6px;font-size:12px}.sf-lang-caption{max-width:82px;overflow:hidden;text-overflow:ellipsis}.sf-lang-menu{max-height:min(66dvh,calc(100dvh - 110px));width:min(342px,calc(100vw - 24px))}}
    `}</style>
  </div>;
}
