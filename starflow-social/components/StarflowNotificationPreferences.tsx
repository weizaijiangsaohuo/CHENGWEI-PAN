'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import '@/components/StarflowGrowth.css';
import {StarflowBackgroundPushSettings} from './StarflowBackgroundPushSettings';

export function StarflowNotificationPreferences(){
 const [userId,setUserId]=useState('');
 const [enabled,setEnabled]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
 useEffect(()=>{
  let active=true;
  if(!hasConfig()){setLoading(false);setError('账号服务尚未配置');return;}
  db().auth.getUser().then(({data:{user},error:e})=>{
   if(!active)return;
   if(e||!user){setError('请先登录');return;}
   setUserId(user.id);
   try{setEnabled(localStorage.getItem('sf-live-alerts-enabled:'+user.id)==='true')}catch{}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'无法读取登录状态')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;};
 },[]);
 function persist(next:boolean){
  if(!userId)return;
  try{
   localStorage.setItem('sf-live-alerts-enabled:'+userId,next?'true':'false');
   setEnabled(next);window.dispatchEvent(new Event('sf-alert-pref-updated'));
  }catch{setError('无法保存提醒设置，请确认浏览器允许本地存储');return;}
  setNotice(next?'已启用站内实时提醒；浏览器后台和关闭网页后不保证收到通知':'已关闭站内实时提醒');
 }
 async function enable(){
  setError('');setNotice('');
  // OS permission can only be requested through a user gesture.
  if(typeof Notification!=='undefined'&&Notification.permission==='default'){
   try{await Notification.requestPermission();}catch{/* In-app toasts remain available. */}
  }
  persist(true);
 }
 return <main className="sf-growth-page"><div className="sf-growth-shell">
  <nav className="sf-growth-nav"><Link href="/settings">← 返回账号设置</Link><Link href="/notifications">通知中心</Link></nav>
  <h1>✦ 实时通知设置</h1>
  <p className="sf-growth-note">使用 Supabase 实时订阅接收关注、互动与系统通知。当 Starflow 网页打开时，可以显示站内提醒；浏览器支持并授予权限后还可尝试显示系统横幅。此功能不等于离线 Web Push。</p>
  {loading?<p role="status">正在读取账号偏好…</p>:!userId?<p role="alert">{error||'请先登录'}</p>:<section className="sf-growth-card">
   <h2>站内实时提醒</h2>
   <p>当前状态：<strong>{enabled?'已开启':'已关闭'}</strong></p>
   <p>浏览器通知权限：{permission==='granted'?'已允许':permission==='denied'?'已禁止':permission==='default'?'尚未询问':'当前浏览器不支持系统横幅'}</p>
   <div className="sf-growth-actions">
    <button type="button" disabled={enabled} onClick={()=>void enable()}>开启实时提醒</button>
    <button type="button" className="secondary" disabled={!enabled} onClick={()=>persist(false)}>关闭提醒</button>
   </div>
   {notice&&<p className="sf-growth-notice" role="status">{notice}</p>}
   {error&&<p className="sf-growth-error" role="alert">{error}</p>}
   <p className="sf-growth-note">不会把私信内容放进系统横幅。iPhone 后台推送须另建可验证的 Web Push 服务，本页不声称已支持。</p>
  </section>}
  {userId&&<StarflowBackgroundPushSettings userId={userId}/>}
 </div></main>;
}
