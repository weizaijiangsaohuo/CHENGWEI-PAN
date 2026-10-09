'use client';
import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import {type Lang, type TranslationKey,translate} from '@/lib/i18n';
const LanguageContext=createContext<{lang:Lang;setLang:(lang:Lang)=>void;t:(key:TranslationKey)=>string}>({lang:'zh',setLang:()=>{},t:key=>translate('zh',key)});
export function LanguageProvider({children}:{children:React.ReactNode}){
  const [lang,setLanguage]=useState<Lang>('zh');
  useEffect(()=>{try{const previous=window.localStorage.getItem('sf-language');if(previous==='en')setLanguage('en')}catch{}},[]);
  useEffect(()=>{document.documentElement.lang=lang==='en'?'en':'zh-CN';try{window.localStorage.setItem('sf-language',lang)}catch{}},[lang]);
  const setLang=useCallback((value:Lang)=>setLanguage(value),[]);
  return <LanguageContext.Provider value={{lang,setLang,t:(key)=>translate(lang,key)}}>{children}</LanguageContext.Provider>
}
export function useLanguage(){return useContext(LanguageContext)}
export function LanguageSwitch({className=''}:{className?:string}){
  const {lang,setLang}=useLanguage();
  return <button className={`sf-lang-switch ${className}`} type="button" onClick={()=>setLang(lang==='zh'?'en':'zh')} aria-label={lang==='zh'?'Switch to English':'切换为简体中文'} title="Language / 语言"><span aria-hidden="true">{lang==='zh'?'🇨🇳':'🇺🇸'}</span> {lang==='zh'?'中文':'English'} <span className="sf-lang-arrow" aria-hidden="true">⌄</span></button>
}
