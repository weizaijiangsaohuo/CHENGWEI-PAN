'use client';
import Link from 'next/link';
import { BadgeCheck, Bookmark, BarChart3, ChevronRight, Headphones, LockKeyhole, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import './StarflowServicesPanel.css';

export function StarflowServicesPanel({isAdmin}:{isAdmin:boolean}){
 const groups=[
  {title:'账号与安全',sub:'保护登录和管理认证',tone:'purple',links:[
   {href:'/settings/security',name:'账户安全管理中心',hint:'邮箱、密码和第三方绑定',icon:LockKeyhole},
   {href:'/verification',name:'账号认证',hint:'认证申请及状态',icon:BadgeCheck}]},
  {title:'创作与社区',sub:'我的内容和互动',tone:'blue',links:[
   {href:'/creator',name:'创作者中心',hint:'作品与创作数据',icon:BarChart3},
   {href:'/bookmarks',name:'我的收藏',hint:'回看收藏的内容',icon:Bookmark},
   {href:'/hub',name:'关注与社区',hint:'关注列表与社区',icon:Users},
   {href:'/messages',name:'私信消息',hint:'查看站内私信',icon:MessageCircle}]},
  {title:'帮助服务',sub:'问题与使用帮助',tone:'teal',links:[
   {href:'/support',name:'星流 AI 客服',hint:'查看客服状态与帮助',icon:Headphones}]},
 ];
 return <div className="sf-services" aria-label="更多服务">
  <h3>更多服务</h3>
  {groups.map(group=><section key={group.title} className={'sf-service-group sf-'+group.tone}>
   <header><strong>{group.title}</strong><small>{group.sub}</small></header>
   {group.links.map(item=>{const Icon=item.icon;return <Link href={item.href} key={item.href}>
    <span className="sf-service-icon"><Icon size={20}/></span>
    <span className="sf-service-copy"><strong>{item.name}</strong><small>{item.hint}</small></span>
    <ChevronRight size={17}/>
   </Link>})}
  </section>)}
  {isAdmin&&<section className="sf-service-group sf-purple">
   <header><strong>平台管理</strong><small>仅供授权管理员使用</small></header>
   <Link href="/admin/verifications"><span className="sf-service-icon"><ShieldCheck size={20}/></span>
    <span className="sf-service-copy"><strong>认证审核</strong><small>管理提交的认证申请</small></span><ChevronRight size={17}/></Link>
  </section>}
 </div>;
}
