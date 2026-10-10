'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BookmarkCheck, CheckCheck, CircleAlert, Heart, MessageCircle, RefreshCw, Repeat2, ShieldAlert, Sparkles, UserPlus } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';

type Notice = {
  id: string;
  kind: string;
  message: string | null;
  recipient_id: string;
  actor_id: string | null;
  post_id: string | null;
  read_at: string | null;
  created_at: string;
  profiles: { id: string; handle: string; display_name: string; avatar_url: string | null } | { id: string; handle: string; display_name: string; avatar_url: string | null }[] | null;
};
type Panel = 'all' | 'unread' | 'mentions' | 'system';
const SYSTEM_KINDS = new Set([
  'verification_approved', 'verification_rejected', 'verification_revoked',
  'account_warning', 'account_violation', 'account_restored',
  'affiliation_invite', 'affiliation_accepted', 'affiliation_activated',
  'affiliation_declined', 'affiliation_removed',
]);
const KIND_TITLES: Record<string, string> = {
  follow: '关注了你', like: '赞了你的帖子', reply: '回复了你的帖子', repost: '转发了你的帖子',
  mention: '在帖子中提及了你', verification_approved: '认证申请已通过',
  verification_rejected: '认证申请未通过', verification_revoked: '认证资格已撤销',
  account_warning: '账号安全提醒', account_violation: '账号违规处理通知',
  account_restored: '账号处理结果更新',
  affiliation_invite: '官方组织邀请你成为附属账号',
  affiliation_accepted: '对方接受了附属账号邀请',
  affiliation_activated: '官方附属账号关联已生效',
  affiliation_declined: '对方拒绝了附属账号邀请',
  affiliation_removed: '官方附属账号关联已解除',
};
const SELECT = 'id,kind,message,recipient_id,actor_id,post_id,read_at,created_at,profiles!notifications_actor_id_fkey(id,handle,display_name,avatar_url)';
const author = (notice: Notice) => Array.isArray(notice.profiles) ? notice.profiles[0] : notice.profiles;
const formatTime = (s: string) => {
  const n = Date.now() - new Date(s).getTime();
  if (!Number.isFinite(n)) return '';
  if (n < 60000) return '刚刚';
  if (n < 3600000) return Math.floor(n / 60000) + ' 分钟前';
  if (n < 86400000) return Math.floor(n / 3600000) + ' 小时前';
  if (n < 604800000) return Math.floor(n / 86400000) + ' 天前';
  return new Date(s).toLocaleDateString('zh-CN');
};

function Center({ host }: { host: Element }) {
  const [tab, setTab] = useState<Panel>('all');
  const [items, setItems] = useState<Notice[]>([]);
  const [viewer, setViewer] = useState('');
  const [badges, setBadges] = useState<Record<string, VerificationKind>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    let running = false;
    const load = async (silent: boolean) => {
      if (!hasConfig() || running) return;
      running = true;
      if (!silent) setLoading(true);
      try {
        const client = db();
        const auth = await client.auth.getUser();
        if (auth.error || !auth.data.user) throw new Error('请先登录后查看通知。');
        const userId = auth.data.user.id;
        const result = await client.from('notifications').select(SELECT).eq('recipient_id', userId)
          .order('created_at', { ascending: false }).limit(100);
        if (result.error) throw result.error;
        const records = (result.data ?? []) as unknown as Notice[];
        const actorIds = [...new Set(records.map(n => n.actor_id).filter((id): id is string => !!id))];
        const approved = actorIds.length ? await client.from('account_verifications')
          .select('profile_id,verification_type').eq('status', 'approved').in('profile_id', actorIds) : null;
        const map: Record<string, VerificationKind> = {};
        if (approved && !approved.error) for (const b of approved.data ?? []) {
          if (b.verification_type === 'blue' || b.verification_type === 'gold' || b.verification_type === 'gray') {
            map[b.profile_id] = b.verification_type;
          }
        }
        if (active) { setViewer(userId); setItems(records); setBadges(map); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '读取失败，请稍后重试。');
      } finally { if (active) setLoading(false); running = false; }
    };
    void load(false);
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(true); }, 30000);
    const resume = () => { if (document.visibilityState === 'visible') void load(true); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [reload]);

  async function markRead(id?: string) {
    if (!viewer || busy) return;
    setBusy(true);
    try {
      let request = db().from('notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_id', viewer).is('read_at', null);
      if (id) request = request.eq('id', id);
      const { error } = await request;
      if (error) throw error;
      const now = new Date().toISOString();
      setItems(prev => prev.map(n => !n.read_at && (!id || n.id === id) ? { ...n, read_at: now } : n));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }

  const unread = items.filter(n => !n.read_at).length;
  const shown = items.filter(n => tab === 'all' || (tab === 'unread' ? !n.read_at : tab === 'mentions' ? n.kind === 'mention' : SYSTEM_KINDS.has(n.kind)));
  const panels: { value: Panel; title: string }[] = [
    { value: 'all', title: '全部' }, { value: 'unread', title: unread ? `未读 ${unread}` : '未读' },
    { value: 'mentions', title: '提及' }, { value: 'system', title: '系统' },
  ];
  return createPortal(<section className="sf3-notifications" aria-label="Starflow 通知中心">
    <div className="sf3-notification-head">
      <div><h2>通知</h2><span>互动与官方消息</span></div>
      <div className="sf3-actions"><button type="button" disabled={loading || busy} aria-label="刷新通知" onClick={() => setReload(v => v + 1)}><RefreshCw size={18}/></button>
        <button type="button" disabled={busy || unread === 0} onClick={() => void markRead()}><CheckCheck size={16}/> 全部已读</button></div>
    </div>
    <div className="sf3-notification-tabs" role="tablist" aria-label="通知分类">
      {panels.map(item => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)}>{item.title}</button>)}
    </div>
    {error && <p className="sf3-error" role="alert">{error} <button type="button" onClick={() => setReload(v => v + 1)}>重试</button></p>}
    {loading ? <div className="sf3-empty" role="status">正在获取通知…</div>
      : shown.length ? <div className="sf3-notification-items">{shown.map(n => {
        const system = SYSTEM_KINDS.has(n.kind);
        const actor = author(n);
        const target = system ? (n.kind.startsWith('affiliation_') ? '/organization/affiliates' : n.kind.startsWith('verification_') ? '/verification' : '/support')
          : n.post_id ? '/post/' + encodeURIComponent(n.post_id)
          : actor ? '/profile/' + encodeURIComponent(actor.handle) : '/notifications';
        const label = KIND_TITLES[n.kind] ?? '与你互动';
        return <Link key={n.id} href={target} className={'sf3-notification' + (!n.read_at ? ' sf3-notification-new' : '')}
          onClick={() => { if (!n.read_at) void markRead(n.id); }}>
          {system ? <span className={'sf3-system-avatar' + (n.kind.includes('violation') || n.kind.includes('warning') ? ' sf3-warning' : '')} aria-hidden="true">
            {n.kind.startsWith('verification_') ? <BookmarkCheck size={25}/> : n.kind.includes('violation') || n.kind.includes('warning') ? <ShieldAlert size={25}/> : <Sparkles size={25}/>}
          </span> : actor?.avatar_url ? <img className="sf3-person-avatar" src={actor.avatar_url} alt="" loading="lazy" />
            : <span className="sf3-person-avatar sf3-person-fallback" aria-hidden="true">{actor?.display_name?.slice(0, 1) || '✦'}</span>}
          <span className="sf3-notification-content">
            <span className="sf3-notification-line"><strong>{n.kind.startsWith('affiliation_') ? (actor?.display_name || 'Starflow 组织') : system ? 'Starflow 官方系统' : actor?.display_name || 'Starflow 用户'}</strong>
              {!system && actor && <VerificationBadge kind={badges[actor.id]} size={16} interactive={false}/>}</span>
            <span className="sf3-notification-kind">{label}</span>
            {system && n.message && <span className="sf3-notification-message">{n.message}</span>}
            <small>{formatTime(n.created_at)}</small>
          </span>
          <span className="sf3-notification-side" aria-hidden="true">
            {!n.read_at && <i className="sf3-unread-dot"/>}
            {!system && (n.kind === 'like' ? <Heart size={19}/> : n.kind === 'repost' ? <Repeat2 size={19}/> : n.kind === 'follow' ? <UserPlus size={19}/> : n.kind === 'reply' ? <MessageCircle size={19}/> : <Bell size={19}/>)}
            {system && <CircleAlert size={19}/>}
          </span>
        </Link>;
      })}</div>
        : <div className="sf3-empty"><span aria-hidden="true"><Bell size={30}/></span>
          <strong>{tab === 'system' ? '暂无官方系统消息' : tab === 'mentions' ? '暂时没有人提及你' : tab === 'unread' ? '所有通知都已读' : '暂时没有新通知'}</strong>
          <p>{tab === 'system' ? '认证结果、组织附属邀请、账号安全和违规处理通知将在这里显示。' : tab === 'all' ? '有人关注、点赞、转发或回复时，这里会收到消息。' : '新的消息到来后会自动更新。'}</p>
        </div>}
    <p className="sf3-notification-footnote">站内通知来自真实数据库，通知页打开时约每 30 秒刷新；不代表 iPhone 系统推送已开启。</p>
    {items.length === 100 && <p className="sf3-notification-footnote">当前只显示最近 100 条记录。</p>}
  </section>, host);
}

export function StarflowNotificationCenter() {
  const path = usePathname() ?? '';
  const enabled = path === '/notifications' || path === '/notifications/';
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    if (!enabled) { setHost(null); return; }
    const sync = () => {
      const next = document.querySelector('.app-frame main.feed-panel');
      setHost(prev => prev === next ? prev : next);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, [enabled]);
  return enabled && host && hasConfig() ? <Center host={host} /> : null;
}
