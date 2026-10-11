'use client';
import {useEffect,useState} from 'react';
import type {CSSProperties,FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight,BookOpen,Globe2,LockKeyhole,MessageCircle,ShieldCheck,Sparkles,Users,ChevronRight,X,Send} from 'lucide-react';
import {SocialApp} from '@/components/SocialApp';
import {LanguageSwitch,useLanguage} from '@/components/LanguageProvider';
import {db,hasConfig} from '@/lib/supabase';
import styles from './landing.module.css';
import {siteText,type SiteKey} from '@/lib/site-copy';
import { StarflowAiWidget } from '@/components/StarflowAiWidget';
import { StarflowLandingExperience } from '@/components/StarflowLandingExperience';
type Screen='checking'|'landing'|'auth'|'member';
type AiLine={role:'user'|'assistant';content:string};
const glass:CSSProperties={background:'rgba(255,255,255,.83)',backdropFilter:'blur(28px) saturate(160%)',WebkitBackdropFilter:'blur(28px) saturate(160%)',border:'1px solid rgba(255,255,255,.82)',boxShadow:'0 16px 54px rgba(49,66,135,.19),inset 0 1px 0 rgba(255,255,255,.98)'};

function LegacyStarflowAiWidget({signedIn,onSignIn,en}:{signedIn:boolean;onSignIn:()=>void;en:boolean}){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState('');
  const [lines,setLines]=useState<AiLine[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!open)return;
    function closeOnEscape(event:KeyboardEvent){if(event.key==='Escape')setOpen(false)}
    document.addEventListener('keydown',closeOnEscape);
    return()=>document.removeEventListener('keydown',closeOnEscape);
  },[open]);

  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const message=input.trim();
    if(!signedIn||!message||busy||message.length>600)return;
    setLines(previous=>[...previous,{role:'user',content:message}]);
    setInput('');setError('');setBusy(true);
    try{
      const {data:{session},error:sessionError}=await db().auth.getSession();
      if(sessionError||!session?.access_token)throw new Error(en?'Please sign in again.':'登录状态已失效，请重新登录。');
      const response=await fetch('/api/ai',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
        body:JSON.stringify({message})
      });
      const result:unknown=await response.json();
      const data=result as {reply?:unknown;error?:unknown};
      if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:(en?'Unable to reach AI.':'AI 暂时无法连接。'));
      if(typeof data?.reply!=='string'||!data.reply.trim())throw new Error(en?'No response received.':'AI 没有返回有效回复。');
      setLines(previous=>[...previous,{role:'assistant',content:data.reply as string}]);
    }catch(caught){setError(caught instanceof Error?caught.message:(en?'Something went wrong.':'请求失败，请稍后重试。'))}
    finally{setBusy(false)}
  }

  return <>
    <style>{`
      .sfai-launcher{position:fixed;z-index:90;right:18px;bottom:calc(82px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.76);border-radius:999px;padding:11px 17px;display:flex;align-items:center;gap:9px;background:linear-gradient(117deg,rgba(63,125,238,.96),rgba(119,93,222,.95) 60%,rgba(174,109,226,.94));color:white;font-weight:760;font-size:13px;box-shadow:0 12px 30px rgba(72,79,185,.33),inset 0 1px 0 rgba(255,255,255,.43);cursor:pointer;transition:transform .2s,box-shadow .2s}
      .sfai-launcher:active{transform:scale(.96)}
      .sfai-panel{position:fixed;z-index:91;right:14px;bottom:calc(145px + env(safe-area-inset-bottom));width:min(392px,calc(100vw - 28px));max-height:min(580px,calc(100dvh - 175px));display:flex;flex-direction:column;border-radius:28px;overflow:hidden;color:#202843}
      .sfai-header{display:flex;align-items:center;gap:11px;padding:15px 16px;border-bottom:1px solid rgba(140,157,210,.18)}
      .sfai-symbol{width:44px;height:44px;flex:none;display:grid;place-items:center;color:#fff;font-size:28px;border-radius:15px;background:linear-gradient(130deg,#57d4e9,#5e85f1 48%,#b777e7);box-shadow:0 5px 14px rgba(99,114,232,.25)}
      .sfai-close{margin-left:auto;border:0;background:rgba(112,130,186,.1);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#59617a}
      .sfai-body{padding:21px 16px;overflow:auto;min-height:150px;flex:1}
      .sfai-welcome{font-size:14px;line-height:1.8;text-align:center;font-weight:550;margin:4px 0 20px}
      .sfai-primary{border:0;color:#fff;background:linear-gradient(120deg,#4f81e9,#866ee6);min-height:44px;padding:12px 20px;border-radius:999px;font-weight:750;cursor:pointer;width:100%}
      .sfai-secondary{display:block;width:100%;border:0;background:none;padding:13px;color:#727990;cursor:pointer}
      .sfai-chatline{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;padding:11px 13px;border-radius:16px;margin-bottom:12px;font-size:13px}
      .sfai-userline{background:#e6e9ff;margin-left:30px;border-bottom-right-radius:5px}
      .sfai-botline{background:rgba(255,255,255,.86);border:1px solid rgba(132,148,218,.18);margin-right:25px;border-bottom-left-radius:5px}
      .sfai-inputrow{display:flex;gap:8px;padding:12px 13px;border-top:1px solid rgba(132,148,218,.18)}
      .sfai-inputrow input{min-width:0;flex:1;border:1px solid rgba(115,139,208,.25);background:rgba(255,255,255,.8);border-radius:999px;padding:12px 14px;outline:0;color:#202843}
      .sfai-inputrow button{border:0;border-radius:50%;width:43px;display:grid;place-items:center;background:#6078e2;color:white}
      .sfai-inputrow button:disabled{opacity:.5}
      .sfai-error{margin:0 15px 9px;color:#aa3949;font-size:12px;line-height:1.5}
      @media(min-width:651px){.sfai-launcher{bottom:24px;right:24px}.sfai-panel{bottom:89px;right:24px}}
      @media(prefers-reduced-motion:reduce){.sfai-launcher{transition:none}}
    `}</style>
    {open&&<section className="sfai-panel" role="dialog" aria-modal="false" aria-label="Starflow AI" style={glass}>
      <div className="sfai-header">
        <div className="sfai-symbol" aria-hidden="true">✦</div>
        <div><strong style={{fontSize:16}}>Starflow AI</strong><div style={{color:'#828ba6',fontSize:11,marginTop:4}}>{en?'Official AI Assistant':'星流官方智能助手'}</div></div>
        <button type="button" className="sfai-close" onClick={()=>setOpen(false)} aria-label={en?'Close':'关闭'}><X size={18}/></button>
      </div>
      {!signedIn?<div className="sfai-body" style={{textAlign:'center'}}>
        <p className="sfai-welcome">{en?'You haven’t signed in or registered yet~':'小主，你还没登录/注册呢～'}</p>
        <button type="button" className="sfai-primary" onClick={()=>{setOpen(false);onSignIn()}}>{en?'Sign in / Register':'登录 / 注册'}</button>
        <button type="button" className="sfai-secondary" onClick={()=>setOpen(false)}>{en?'Maybe later':'稍后再说'}</button>
      </div>:<>
        <div className="sfai-body" aria-live="polite">
          {lines.length===0&&<p style={{color:'#626c8c',fontSize:13,lineHeight:1.8,margin:'5px 0'}}>{en?'Hello! I’m the Starflow AI assistant (text beta). How can I help?':'你好！我是 ✦ Starflow AI 智能助手，全世界最强大的AI模型，你可以直接输入问题。'}</p>}
          {lines.map((line,index)=><div key={index} className={`sfai-chatline ${line.role==='user'?'sfai-userline':'sfai-botline'}`}>{line.content}</div>)}
          {busy&&<div style={{fontSize:12,color:'#69759c'}} role="status">{en?'AI is thinking…':'AI 正在思考…'}</div>}
        </div>
        {error&&<p className="sfai-error" role="alert">{error}</p>}
        <form className="sfai-inputrow" onSubmit={send}>
          <input value={input} onChange={event=>setInput(event.target.value)} maxLength={600} placeholder={en?'Ask a question…':'输入你的问题…'} aria-label={en?'Your message':'你的问题'}/>
          <button type="submit" disabled={busy||!input.trim()} aria-label={en?'Send':'发送'}><Send size={17}/></button>
        </form>
      </>}
    </section>}
    <button type="button" className="sfai-launcher" onClick={()=>setOpen(previous=>!previous)} aria-label={en?'Open Starflow AI':'打开 Starflow AI'}><Sparkles size={19}/> ✦ Starflow AI</button>
  </>;
}

export default function Home(){
  const [screen,setScreen]=useState<Screen>('checking');
  const {lang}=useLanguage();
  const en=lang!=='zh'&&lang!=='zh-hk';
  const home=(key:SiteKey)=>siteText(lang,key);
  useEffect(()=>{
    if(!hasConfig()){setScreen('landing');return;}
    let active=true;
    const client=db();
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      if(active&&session?.user)setScreen('member');
    });
    client.auth.getUser().then(({data:{user}})=>{
      if(active)setScreen(current=>current==='auth'?current:(user?'member':'landing'));
    }).catch(()=>{if(active)setScreen('landing')});
    return()=>{active=false;subscription.unsubscribe()};
  },[]);
  if(screen==='checking')return <main className={styles.loading} role="status" aria-live="polite"><span style={{width:26,height:26,border:'3px solid #efe2f4',borderTopColor:'#a56aca',borderRadius:'50%',animation:'spin .8s linear infinite'}} aria-hidden="true"/><span style={{fontSize:13}}>{en?'Loading…':'加载中…'}</span></main>;
  const enter=()=>setScreen('auth');
  return <>
    {screen==='member'||screen==='auth'?<SocialApp view="home"/>:<StarflowLandingExperience onJoin={enter}/>}
    <StarflowAiWidget signedIn={screen==='member'} onSignIn={enter} en={en}/>
  </>;
}
