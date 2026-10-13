'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import type {User} from '@supabase/supabase-js';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowGrowth.css';

type Draft={id:string;content:string;updated_at:string};
type Scheduled={id:string;content:string;scheduled_for:string;status:string;post_id:string|null;last_error:string|null};
const localTime=(iso:string)=>new Date(iso).toLocaleString('zh-CN',{hour12:false});
export function StarflowDraftScheduler(){
 const [user,setUser]=useState<User|null>(null);
 const [content,setContent]=useState('');
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [scheduled,setScheduled]=useState<Scheduled[]>([]);
 const [when,setWhen]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const refresh=useCallback(async(uid:string)=>{
  const client=db();
  const [d,s]=await Promise.all([
   client.from('sf_post_drafts').select('id,content,updated_at').eq('user_id',uid).order('updated_at',{ascending:false}).limit(40),
   client.from('sf_scheduled_posts').select('id,content,scheduled_for,status,post_id,last_error').eq('user_id',uid).order('scheduled_for',{ascending:false}).limit(40)
  ]);
  if(d.error||s.error)throw new Error(d.error?.message||s.error?.message||'无法载入数据');
  setDrafts((d.data||[]) as Draft[]);
  setScheduled((s.data||[]) as Scheduled[]);
 },[]);
 useEffect(()=>{
  let active=true;
  if(!hasConfig()){setError('请先配置账号服务');setLoading(false);return;}
  db().auth.getUser().then(async ({data:{user:me},error:err})=>{
   if(!active)return;
   if(err||!me){setError('请先登录 Starflow');return;}
   setUser(me);
   await refresh(me.id);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'服务暂不可用')}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[refresh]);
 const perform=async(action:()=>Promise<void>,message:string)=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await action();if(user)await refresh(user.id);setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:'操作失败，请重试');}
  finally{setBusy(false);}
 };
 const verify=()=>{
  if(!user)throw new Error('请先登录');
  const t=content.trim();
  if(Array.from(t).length<1||Array.from(t).length>280)throw new Error('请输入 1–280 字文字内容');
  return t;
 };
 async function saveDraft(){
  await perform(async()=>{
   const t=verify();
   const {error}=await db().from('sf_post_drafts').insert({user_id:user!.id,content:t});
   if(error)throw error;
   setContent('');
  },'文字草稿已安全保存到账号，可在其他设备登录后查看');
 }
 async function schedule(){
  await perform(async()=>{
   const text=verify();const timestamp=new Date(when);
   if(!when||!Number.isFinite(timestamp.getTime()))throw Error('请选择有效的发布时间');
   const min=Date.now()+5*60000;const max=Date.now()+30*86400000;
   if(timestamp.getTime()<min||timestamp.getTime()>max)throw Error('仅支持提前5分钟至30天');
   const {data,error}=await db().rpc('sf_schedule_text_post',{
    p_content:text,p_scheduled_for:timestamp.toISOString()
   });
   if(error||!data)throw Error(error?.message||'预约未成功');
   setContent('');setWhen('');
  },'已预约，系统将由后台任务按所选时间发布（存在少量执行延迟）');
 }
 async function deleteDraft(id:string){
  await perform(async()=>{
   const {error}=await db().from('sf_post_drafts').delete().eq('id',id).eq('user_id',user!.id);
   if(error)throw error;
  },'草稿已删除');
 }
 async function cancel(id:string){
  await perform(async()=>{
   const {data,error}=await db().rpc('sf_cancel_scheduled_post',{p_id:id});
   if(error||!data)throw new Error(error?.message||'仅能取消尚未发布的预约');
  },'预约已取消');
 }
 function restore(text:string){
  if(!user)return;
  // Existing home editor already hydrates this per-user local draft key.
  try{window.localStorage.setItem('sf-draft-'+user.id+'-home-',text)}catch{setError('浏览器禁止本地存储，请先开启存储权限');return}
  window.location.assign('/?compose=1');
 }
 return <main className="sf-growth-page"><div className="sf-growth-shell">
  <nav className="sf-growth-nav"><Link href="/">← 返回首页</Link><Link href="/creator">创作者统计</Link><Link href="/trending">热门话题</Link></nav>
  <h1>✦ 草稿箱与定时发布</h1>
  <p className="sf-growth-note">账号云端草稿支持跨设备同步。当前版本只保存和预约文字动态，不支持图片、视频或投票自动发布。</p>
  {loading?<p role="status">正在验证账号并载入草稿…</p>:!user?<p role="alert">{error||'请先登录 Starflow'}</p>:<>
   {notice&&<p role="status" className="sf-growth-notice">{notice}</p>}
   {error&&<p role="alert" className="sf-growth-error">{error}</p>}
   <section className="sf-growth-card"><h2>撰写文字</h2>
    <label htmlFor="sf-growth-content">动态内容（最多280字）</label>
    <textarea id="sf-growth-content" rows={5} value={content} onChange={e=>setContent(e.target.value)} maxLength={280} placeholder="写下此刻想分享的内容…"/>
    <small>{Array.from(content).length}/280 字</small>
    <div className="sf-growth-actions">
     <button type="button" disabled={busy||!content.trim()} onClick={()=>void saveDraft()}>保存到云端草稿箱</button>
     <button type="button" className="secondary" disabled={busy||!content.trim()} onClick={()=>restore(content)}>返回发布框</button>
    </div>
    <label htmlFor="sf-growth-when">预约发布日期和时间（设备当地时间）</label>
    <input id="sf-growth-when" type="datetime-local" value={when} min={new Date(Date.now()+6*60000).toISOString().slice(0,16)} onChange={e=>setWhen(e.target.value)}/>
    <button type="button" disabled={busy||!content.trim()||!when} onClick={()=>void schedule()}>预约定时发布</button>
    <p className="sf-growth-note">最早5分钟后，最晚30天内；后台每分钟检查到期记录。若发布被限制或失败，状态会如实显示。</p>
   </section>
   <section className="sf-growth-card"><h2>云端草稿 · {drafts.length}</h2>
    {drafts.length===0?<p>还没有云端文字草稿。</p>:drafts.map(d=><article key={d.id} className="sf-growth-item">
     <p>{d.content}</p><small>{localTime(d.updated_at)}</small>
     <div className="sf-growth-actions">
      <button type="button" className="secondary" onClick={()=>setContent(d.content)}>继续编辑</button>
      <button type="button" className="secondary" onClick={()=>restore(d.content)}>打开发布框</button>
      <button type="button" className="danger" disabled={busy} onClick={()=>void deleteDraft(d.id)}>删除</button>
     </div>
    </article>)}
   </section>
   <section className="sf-growth-card"><h2>预约记录 · {scheduled.length}</h2>
    {scheduled.length===0?<p>还没有定时发布记录。</p>:scheduled.map(s=><article key={s.id} className="sf-growth-item">
     <p>{s.content}</p><small>计划：{localTime(s.scheduled_for)} · {({
      pending:'等待发布',published:'已发布',cancelled:'已取消',failed:'发布失败'
     } as Record<string,string>)[s.status]||s.status}</small>
     {s.last_error&&<small role="alert">{s.last_error}</small>}
     <div className="sf-growth-actions">
      {s.post_id&&<Link href={'/post/'+encodeURIComponent(s.post_id)}>查看动态 →</Link>}
      {s.status==='pending'&&<button type="button" className="danger" disabled={busy} onClick={()=>void cancel(s.id)}>取消预约</button>}
     </div>
    </article>)}
   </section>
  </>}
 </div></main>;
}
