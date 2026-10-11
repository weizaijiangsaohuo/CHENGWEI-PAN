'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, LoaderCircle, ShieldCheck } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';

type NoticeDetail = {
 id: string; kind: string; recipient_id: string; actor_id: string | null;
 post_id: string | null; message: string | null; created_at: string; read_at: string | null;
};
const kinds: Record<string,string> = {
 system_announcement:'Starflow 官方公告',
 account_security:'账号安全提醒',
 account_warning:'账号警告通知',
 account_violation:'账号违规处理通知',
 account_restored:'账号处理结果',
 verification_approved:'认证申请已通过',
 verification_rejected:'认证申请未通过',
 verification_revoked:'认证资格已撤销',
 affiliation_invite:'附属账号邀请',
 affiliation_accepted:'附属账号邀请已接受',
 affiliation_activated:'附属账号关联已生效',
 affiliation_declined:'附属账号邀请被拒绝',
 affiliation_removed:'附属账号关联已解除',
 appeal_result:'账号申诉处理结果',
 subscription_activated:'会员资格开通',
 subscription_expired:'会员资格到期',
 follow:'新增关注', like:'收到点赞', repost:'帖子被转发', reply:'收到回复', mention:'你被提及',
};

export function StarflowNoticeDetail({ id }: { id: string }) {
 const [item,setItem]=useState<NoticeDetail|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try{
    if(!hasConfig())throw new Error('尚未连接账号数据库。');
    const client=db();
    const auth=await client.auth.getUser();
    if(auth.error||!auth.data.user)throw new Error('请先登录，才能查看自己的官方消息。');
    const {data,error:fetchError}=await client.from('notifications')
      .select('id,kind,recipient_id,actor_id,post_id,message,created_at,read_at')
      .eq('id',id).eq('recipient_id',auth.data.user.id).maybeSingle();
    if(fetchError)throw fetchError;
    if(!data)throw new Error('通知不存在，或者你没有权限查看这条通知。');
    if(!live)return;
    setItem(data as NoticeDetail);
    if(!data.read_at){
     const {error:markError}=await client.from('notifications')
       .update({read_at:new Date().toISOString()})
       .eq('id',id).eq('recipient_id',auth.data.user.id).is('read_at',null);
     if(markError && live)setError('已打开通知，但标记已读失败：'+markError.message);
    }
   }catch(reason){if(live)setError(reason instanceof Error?reason.message:'无法加载通知。');}
   finally{if(live)setLoading(false);}
  };
  void load();
  return()=>{live=false;};
 },[id]);

 const related=item?.kind.startsWith('verification_')?'/verification':
  item?.kind.startsWith('affiliation_')?'/organization/affiliates':
  item?.kind.startsWith('account_')?'/settings':
  item?.kind==='appeal_result'?'/support':
  item?.post_id?'/post/'+encodeURIComponent(item.post_id):null;
 const label=item?kinds[item.kind]||'Starflow 站内通知':'';
 return <main className="sf-notice-detail">
  <header className="sf-notice-top"><Link href="/notifications"><ArrowLeft size={18}/> 返回通知</Link>
   <span><Bell size={19}/> 星流 Starflow</span></header>
  <article className="sf-notice-card">
   {loading?<div className="sf-notice-state" role="status"><LoaderCircle size={20}/> 正在读取…</div>:
   item?<>
    <div className="sf-notice-stamp"><ShieldCheck size={20}/> {item.actor_id?'Starflow 互动通知':'Starflow 官方系统消息'}</div>
    <h1>{label}</h1>
    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('zh-CN')}</time>
    <div className="sf-notice-body">{item.message?.trim()||'此通知暂无额外说明。'}</div>
    {related&&<Link className="sf-notice-action" href={related}>查看相关页面 →</Link>}
   </>:
   <div className="sf-notice-state" role="alert">{error||'无法加载通知。'}<Link href="/notifications">返回通知列表</Link></div>}
   {item&&error&&<p className="sf-notice-error" role="alert">{error}</p>}
  </article>
 </main>;
}
