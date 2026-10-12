import type {Notif,Profile} from './types';

export type NotificationGroup='all'|'interaction'|'follow'|'verification'|'system';

const INTERACTION=new Set(['like','reply','repost','mention']);
const VERIFICATION=new Set(['verification_approved','verification_rejected','verification_revoked',
 'affiliation_invite','affiliation_accepted','affiliation_activated','affiliation_declined','affiliation_removed']);
const LABELS:Record<string,[string,string]>={
 like:['赞了你的动态','liked your post'],
 reply:['回复了你的动态','replied to your post'],
 repost:['转发了你的动态','reposted your post'],
 mention:['提到了你','mentioned you'],
 follow:['关注了你','followed you'],
 direct_message:['向你发送了私信','sent you a private message'],
 verification_approved:['认证申请已通过','Your verification was approved'],
 verification_rejected:['认证申请未通过','Your verification was declined'],
 verification_revoked:['认证资格已撤销','Your verification was revoked'],
 affiliation_invite:['收到组织关联邀请','You received an affiliation invitation'],
 affiliation_accepted:['组织邀请已接受','Your affiliation invitation was accepted'],
 affiliation_activated:['组织关联已生效','An organization affiliation is active'],
 affiliation_declined:['组织邀请已拒绝','An affiliation invitation was declined'],
 affiliation_removed:['组织关联已解除','An organization affiliation ended'],
 account_warning:['收到账户提醒','Account warning'],
 account_violation:['收到账户违规通知','Account violation notice'],
 account_restored:['账户状态已恢复','Your account was restored'],
 account_security:['收到账户安全提醒','Account security notice'],
 system_announcement:['星流系统公告','Starflow announcement'],
 appeal_result:['申诉处理结果已更新','Appeal result updated'],
 subscription_activated:['订阅已开通','Subscription activated'],
 subscription_expired:['订阅已到期','Subscription expired']
};

export function notificationGroup(kind:string):Exclude<NotificationGroup,'all'>{
 if(INTERACTION.has(kind)||kind==='direct_message')return 'interaction';
 if(kind==='follow')return 'follow';
 if(VERIFICATION.has(kind))return 'verification';
 return 'system';
}

export function visibleNotifications<T extends {kind:string}>(
 items:readonly T[],group:NotificationGroup):T[]{
 return group==='all'?[...items]:items.filter(item=>notificationGroup(item.kind)===group);
}

export function notificationLabel(kind:string,english:boolean):string{
 return LABELS[kind]?.[english?1:0]??(english?'sent you an update':'发送了一条通知');
}

export function notificationTarget(note:Pick<Notif,'id'|'kind'|'post_id'>,actor:Pick<Profile,'handle'>|null):string{
 if(note.kind==='direct_message')return '/messages';
 if(INTERACTION.has(note.kind)&&note.post_id)return '/post/'+encodeURIComponent(note.post_id);
 if(note.kind==='follow'&&actor)return '/profile/'+encodeURIComponent(actor.handle);
 // All official and organization notices carry their own actual detail record.
 return '/notifications/'+encodeURIComponent(note.id);
}
