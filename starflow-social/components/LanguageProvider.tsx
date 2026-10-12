'use client';
import {createContext,useContext} from 'react';
import {type Lang,type TranslationKey,translate} from '@/lib/i18n';

// The language picker has been retired. Keep the context for existing social,
// auth and accessibility features without changing their public interfaces.
const fixedLanguage:Lang='zh';
const defaultContext:{lang:Lang;setLang:(lang:Lang)=>void;t:(key:TranslationKey)=>string}={
 lang:fixedLanguage,
 setLang:(_value:Lang)=>{},
 t:(key:TranslationKey)=>translate(fixedLanguage,key)
};
const LanguageContext=createContext(defaultContext);
export function LanguageProvider({children}:{children:React.ReactNode}){
 return <LanguageContext.Provider value={defaultContext}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){return useContext(LanguageContext)}

// Compatibility for legacy pages until their header markup is simplified.
// Deliberately renders nothing: no language toolbar/menu can reappear.
export function LanguageSwitch(){return null;}
