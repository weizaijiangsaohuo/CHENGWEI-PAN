'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, Clipboard, Hash, Heart, MessageCircle, RefreshCw, Repeat2, Search, Share2, UserRound, X } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import type { Notif, Post, Profile } from '@/lib/types';
import { ago, unwrap } from '@/lib/types';
import { Avatar } from './Brand';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';

type SearchTab = 'all' | 'people' | 'posts' | 'topics';
type NoticeTab = 'all' | 'unread' | 'mentions';
type Topic = { name: string; count: number };

const postSelect = 'id,author_id,content,image_url,video_url,has_poll,has_gallery,parent_id,created_at,profiles!posts_author_id_fkey(id,handle,display_name,bio,avatar_url,created_at)';

function usePortalHost(pathname: string, matches: boolean, selector: string) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    if (!matches) {
      setHost(null);
      return;
    }
    const sync = () => {
      const match = document.querySelector(selector);
      setHost(current => current === match ? current : match);
    };
    const watcher = new MutationObserver(sync);
    watcher.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => watcher.disconnect();
  }, [pathname, matches, selector]);
  return host;
}

function readError(reason: unknown): string {
  return reason instanceof Error ? reason.message : '暂时无法加载，请稍后重试。';
}

function stripWildcards(s: string) {
  return s.trim().slice(0, 48).replace(/[\\%_]/g, '').replace(/[(),]/g, '');
}

function SearchExperience({ host }: { host: Element }) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [badges, setBadges] = useState<Record<string, VerificationKind>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const value = new URLSearchParams(window.location.search).get('tag');
      if (value) { setTerm('#' + value.slice(0, 40)); setTab('posts'); }
    } catch { /* search still works with an empty query */ }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!hasConfig()) { setLoading(false); return; }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const client = db();
        const needle = stripWildcards(debounced);
        const actualNeedle = needle.startsWith('#') ? needle : needle;
        const [recent, foundPosts, peopleByHandle, peopleByName] = await Promise.all([
          client.from('posts').select('content').is('parent_id', null)
            .order('created_at', { ascending: false }).limit(150),
          needle ? client.from('posts').select(postSelect).is('parent_id', null)
            .ilike('content', '%' + actualNeedle + '%').order('created_at', { ascending: false }).limit(60)
            : Promise.resolve({ data: [], error: null }),
          needle ? client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at')
            .ilike('handle', '%' + needle.replace(/^@/, '') + '%').limit(14)
            : client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at')
              .order('created_at', { ascending: false }).limit(8),
          needle ? client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at')
            .ilike('display_name', '%' + needle.replace(/^@/, '') + '%').limit(14)
            : Promise.resolve({ data: [], error: null }),
        ]);
        for (const result of [recent, foundPosts, peopleByHandle, peopleByName]) {
          if (result.error) throw result.error;
        }
        const byId = new Map<string, Profile>();
        for (const row of [...(peopleByHandle.data ?? []), ...(peopleByName.data ?? [])]) {
          if (typeof row.id === 'string') byId.set(row.id, row as Profile);
        }
        const sampleTags = new Map<string, number>();
        for (const row of recent.data ?? []) {
          const found = new Set<string>();
          const content = typeof row.content === 'string' ? row.content : '';
          for (const match of content.matchAll(/#([\p{L}\p{N}_]{1,32})/gu)) {
            found.add(match[1].toLocaleLowerCase());
          }
          for (const tag of found) sampleTags.set(tag, (sampleTags.get(tag) ?? 0) + 1);
        }
        const list = [...sampleTags.entries()].map(([name, count]) => ({ name, count }))
          .filter(item => !needle || item.name.includes(needle.replace(/^#/, '').toLocaleLowerCase()))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 12);
        const profiles = [...byId.values()];
        const badgeIds = [...new Set(profiles.map(p => p.id))];
        const approved = badgeIds.length ? await client.from('account_verifications')
          .select('profile_id,verification_type').eq('status', 'approved').in('profile_id', badgeIds)
          : null;
        const kindMap: Record<string, VerificationKind> = {};
        if (approved && !approved.error) for (const row of approved.data ?? []) {
          if (row.verification_type === 'blue' || row.verification_type === 'gold' || row.verification_type === 'gray') {
            kindMap[row.profile_id] = row.verification_type;
          }
        }
        if (active) {
          setPeople(profiles);
          setPosts((foundPosts.data ?? []) as unknown as Post[]);
          setTopics(list);
          setBadges(kindMap);
        }
      } catch (cause) {
        if (active) setError(readError(cause));
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [debounced]);

  const filled = stripWildcards(debounced).length > 0;
  const showPeople = tab === 'all' || tab === 'people';
  const showPosts = tab === 'all' || tab === 'posts';
  const showTopics = tab === 'all' || tab === 'topics';
  const trimmedPosts = tab === 'all' ? posts.slice(0, 5) : posts;
  const trimmedPeople = tab === 'all' ? people.slice(0, 5) : people;
  const trimmedTopics = tab === 'all' ? topics.slice(0, 5) : topics;
  return createPortal(<section className="sf2-search" aria-label="探索与搜索">
    <div className="sf2-page-title"><h2>探索</h2><p>搜索用户、帖子和公开话题</p></div>
    <div className="sf2-search-input-wrap">
      <Search size={20} aria-hidden="true" />
      <input aria-label="搜索" type="search" value={term} placeholder="搜索用户、帖子或 #话题"
        maxLength={48} onChange={e => setTerm(e.target.value)} />
      {term && <button type="button" aria-label="清除搜索" onClick={() => setTerm('')}><X size={18}/></button>}
    </div>
    <div className="sf2-tabs" role="tablist" aria-label="搜索分类">
      {([['all', '全部'], ['people', '用户'], ['posts', '帖子'], ['topics', '话题']] as const)
        .map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={tab === id}
          onClick={() => setTab(id)}>{name}</button>)}
    </div>
    {loading ? <p className="sf2-state" role="status">正在搜索…</p>
      : error ? <p className="sf2-state sf2-error" role="alert">搜索失败：{error}</p>
      : <>
        {showPeople && <div className="sf2-group"><h3>{filled ? '相关用户' : '新加入的用户'}</h3>
          {trimmedPeople.length ? trimmedPeople.map(person =>
            <Link href={'/profile/' + encodeURIComponent(person.handle)} key={person.id} className="sf2-person">
              <Avatar name={person.display_name} image={person.avatar_url} size={42}/>
              <span><span className="sf2-person-name"><strong>{person.display_name}</strong>
                <VerificationBadge kind={badges[person.id]} size={16}/></span>
                <small>@{person.handle}</small>{person.bio && <em>{person.bio}</em>}
              </span>
            </Link>) : <p className="sf2-empty">没有匹配的用户。</p>}
        </div>}
        {showTopics && <div className="sf2-group"><h3>近期公开话题 <small>最近最多 150 条公开帖子统计</small></h3>
          {trimmedTopics.length ? trimmedTopics.map(topic =>
            <Link href={'/explore?tag=' + encodeURIComponent(topic.name)} key={topic.name} className="sf2-topic"
              onClick={() => { setTerm('#' + topic.name); setTab('posts'); }}>
              <Hash size={19}/><span><strong>#{topic.name}</strong><small>近期 {topic.count} 条帖子</small></span>
            </Link>) : <p className="sf2-empty">没有匹配的近期公开话题。</p>}
        </div>}
        {showPosts && <div className="sf2-group"><h3>{filled ? '相关帖子' : '查找帖子'}</h3>
          {!filled ? <p className="sf2-empty">输入关键词、#话题，即可搜索公开帖子。</p>
            : trimmedPosts.length ? trimmedPosts.map(post => {
              const author = unwrap(post.profiles);
              return <Link className="sf2-post" href={'/post/' + encodeURIComponent(post.id)} key={post.id}>
                <div className="sf2-post-user"><Avatar name={author?.display_name ?? '用户'} image={author?.avatar_url} size={36}/>
                  <span><strong>{author?.display_name ?? 'Starflow 用户'}</strong>
                    <small>@{author?.handle ?? 'unknown'} · {ago(post.created_at)}</small></span></div>
                <div className="sf2-post-content">{post.content || (post.image_url || post.video_url ? '媒体帖子' : '查看帖子详情')}</div>
                {post.image_url && <img className="sf2-post-image" src={post.image_url} alt="帖子配图" loading="lazy" />}
                {post.video_url && <span className="sf2-post-video">视频内容 · 点击查看</span>}
                <small className="sf2-post-link">查看帖子与互动 →</small>
              </Link>;
            }) : <p className="sf2-empty">没有找到匹配的公开帖子。</p>}
        </div>}
      </>}
    <p className="sf2-footnote">搜索结果来自当前数据库；话题仅是近期样本，不代表全站实时热搜。</p>
  </section>, host);
}

function NotificationsExperience({ host }: { host: Element }) {
  const [tab, setTab] = useState<NoticeTab>('all');
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, VerificationKind>>({});

  const load = async (isActive: () => boolean) => {
    if (!hasConfig()) return;
    setLoading(true);
    setError('');
    try {
      const client = db();
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error('请登录后查看通知。');
      const id = auth.data.user.id;
      const { data, error } = await client.from('notifications')
        .select('id,recipient_id,actor_id,kind,post_id,read_at,created_at,profiles!notifications_actor_id_fkey(id,handle,display_name,bio,avatar_url,created_at)')
        .eq('recipient_id', id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const notices = (data ?? []) as unknown as Notif[];
      const actorIds = [...new Set(notices.map(x => x.actor_id))];
      const approved = actorIds.length ? await client.from('account_verifications')
        .select('profile_id,verification_type').eq('status', 'approved').in('profile_id', actorIds) : null;
      const badgeMap: Record<string, VerificationKind> = {};
      if (approved && !approved.error) for (const row of approved.data ?? []) {
        if (row.verification_type === 'blue' || row.verification_type === 'gold' || row.verification_type === 'gray') {
          badgeMap[row.profile_id] = row.verification_type;
        }
      }
      if (isActive()) { setViewerId(id); setItems(notices); setBadges(badgeMap); }
    } catch (reason) {
      if (isActive()) setError(readError(reason));
    } finally { if (isActive()) setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, []);

  async function markRead(notificationId?: string) {
    if (!viewerId || pending) return;
    setPending(true); setError('');
    try {
      let q = db().from('notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_id', viewerId).is('read_at', null);
      if (notificationId) q = q.eq('id', notificationId);
      const { error } = await q;
      if (error) throw error;
      const stamp = new Date().toISOString();
      setItems(current => current.map(n => (!notificationId || n.id === notificationId)
        ? { ...n, read_at: n.read_at || stamp } : n));
    } catch (reason) { setError(readError(reason)); }
    finally { setPending(false); }
  }
  const unread = items.filter(n => !n.read_at).length;
  const shown = items.filter(n => tab === 'all' || (tab === 'unread' ? !n.read_at : n.kind === 'mention'));
  const kinds: Record<string, { label: string; icon: 'heart' | 'reply' | 'follow' | 'repost' }> = {
    like: { label: '赞了你的帖子', icon: 'heart' },
    reply: { label: '回复了你的帖子', icon: 'reply' },
    follow: { label: '关注了你', icon: 'follow' },
    repost: { label: '转发了你的帖子', icon: 'repost' },
    mention: { label: '提及了你', icon: 'reply' },
  };
  return createPortal(<section className="sf2-notifications" aria-label="账号通知">
    <div className="sf2-page-title sf2-notice-title"><h2>通知</h2>
      <div className="sf2-notice-actions">
        <button type="button" aria-label="刷新通知" title="刷新通知" onClick={() => void load(() => true)} disabled={loading || pending}>
          <RefreshCw size={17}/>
        </button>
        <button type="button" onClick={() => void markRead()} disabled={pending || unread === 0}>全部已读</button>
      </div>
    </div>
    <div className="sf2-tabs" role="tablist" aria-label="通知分类">
      {([['all', '全部'], ['unread', `未读${unread ? ` ${unread}` : ''}`], ['mentions', '提及']] as const)
        .map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={tab === id}
          onClick={() => setTab(id)}>{name}</button>)}
    </div>
    {loading ? <p className="sf2-state" role="status">正在读取通知…</p>
      : error ? <p className="sf2-state sf2-error" role="alert">{error}</p>
      : shown.length ? shown.map(item => {
        const actor = unwrap(item.profiles);
        const info = kinds[item.kind] ?? { label: '与你互动', icon: 'reply' as const };
        const url = item.post_id ? '/post/' + encodeURIComponent(item.post_id)
          : actor ? '/profile/' + encodeURIComponent(actor.handle) : '/notifications';
        return <div className={'sf2-notice' + (!item.read_at ? ' sf2-unread' : '')} key={item.id}>
          <Link href={url} onClick={() => { if (!item.read_at) void markRead(item.id); }} className="sf2-notice-link">
            <Avatar name={actor?.display_name || '用户'} image={actor?.avatar_url} size={42}/>
            <span className="sf2-notice-body"><span className="sf2-notice-head"><strong>{actor?.display_name ?? 'Starflow 用户'}</strong>
              <VerificationBadge kind={badges[item.actor_id]} size={16}/></span>
              <span>{info.label}</span><small>{ago(item.created_at)}</small></span>
            <span className="sf2-notice-kind" aria-hidden="true">{info.icon === 'heart' ? <Heart size={18}/> : info.icon === 'follow' ? <UserRound size={18}/> : info.icon === 'repost' ? <Repeat2 size={18}/> : <MessageCircle size={18}/>}</span>
            {!item.read_at && <span className="sf2-unread-dot" aria-label="未读"/>}
          </Link>
        </div>;
      }) : <p className="sf2-state">{tab === 'mentions' ? '还没有提及通知。当前仅展示数据库实际产生的提及记录。' : tab === 'unread' ? '所有通知都已读。' : '暂时没有通知。'}</p>}
    {items.length >= 100 && <p className="sf2-footnote">当前展示最近最多 100 条通知。</p>}
    <p className="sf2-footnote">通知分类只展示真实记录；提及提醒需由服务器规则产生。</p>
  </section>, host);
}

function ThreadTools({ host, postId }: { host: Element; postId: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  function focusReply() {
    document.querySelector<HTMLTextAreaElement>('.app-frame .reply-area textarea')?.focus();
    document.querySelector('.app-frame .reply-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function share() {
    const url = new URL('/post/' + encodeURIComponent(postId), window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Starflow 帖子', url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } else window.prompt('复制帖子链接：', url);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError('分享失败，可尝试复制链接。');
    }
  }
  async function copy() {
    const url = new URL('/post/' + encodeURIComponent(postId), window.location.origin).toString();
    try { await navigator.clipboard.writeText(url); setCopied(true); setError(''); }
    catch { window.prompt('长按复制帖子链接：', url); }
  }
  return createPortal(<div className="sf2-thread-tools" aria-label="帖子分享工具">
    <button type="button" onClick={focusReply}><MessageCircle size={16}/> 写回复</button>
    <button type="button" onClick={() => void share()}><Share2 size={16}/> 分享帖子</button>
    <button type="button" onClick={() => void copy()}><Clipboard size={16}/> {copied ? '已复制' : '复制链接'}</button>
    {error && <small role="alert">{error}</small>}
  </div>, host);
}

export function StarflowDiscoveryPhase2() {
  const pathname = usePathname() ?? '';
  const inExplore = pathname === '/explore' || pathname === '/explore/';
  const inNotifications = pathname === '/notifications' || pathname === '/notifications/';
  const thread = /^\/post\/([a-z0-9-]+)\/?$/i.exec(pathname);
  const main = usePortalHost(pathname, inExplore || inNotifications, '.app-frame main.feed-panel');
  const reply = usePortalHost(pathname, Boolean(thread), '.app-frame .reply-area');
  if (!hasConfig()) return null;
  return <>
    {main && inExplore && <SearchExperience key="explore" host={main}/>} 
    {main && inNotifications && <NotificationsExperience key="notifications" host={main}/>} 
    {reply && thread && <ThreadTools key={thread[1]} host={reply} postId={thread[1]}/>} 
  </>;
}
