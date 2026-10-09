'use client';
import {useLanguage} from '@/components/LanguageProvider';
export default function NotFound(){const {lang}=useLanguage();return <main className="center-screen"><div className="mini-card"><h1>{lang==='en'?'Page not found':'页面不存在'}</h1><a href="/">{lang==='en'?'Back to home':'返回首页'}</a></div></main>}
