'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Hash, Search, Sparkles, UserPlus } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';

type Account = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};
type Topic = { tag: string; count: number };

// The existing SocialApp has a static right rail. Mount the replacement into
// that same region so posting, auth, notifications and Supabase stay unchanged.
export function StarflowDiscovery() {
  const pathname = usePathname();
  const router = useRouter();
  const [host, setHost] = useState<Element | null>(null);
  const [term, setTerm] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // The sidebar may appear after auth hydration or be replaced on navigation.
    // Track element identity so the portal never targets a detached sidebar.
    const updateHost = () => {
      const found = document.querySelector('.app-frame .right-sidebar');
      setHost(previous => previous === found ? previous : found);
    };
    const observer = new MutationObserver(updateHost);
    observer.observe(document.body, { childList: true, subtree: true });
    updateHost();
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!host || !hasConfig()) {
      if (host) setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const client = db();
        const [auth, feed, people] = await Promise.all([
          client.auth.getUser(),
          client.from('posts').select('content').is('parent_id', null)
            .order('created_at', { ascending: false }).limit(150),
          client.from('profiles')
            .select('id,handle,display_name,avatar_url')
            .order('created_at', { ascending: false }).limit(35),
        ]);
        if (feed.error) throw feed.error;
        if (people.error) throw people.error;
        const id = auth.data.user?.id ?? null;
        const followResponse = id
          ? await client.from('follows').select('following_id').eq('follower_id', id).limit(1000)
          : null;
        if (followResponse?.error) throw followResponse.error;

        // Count a hashtag once per post. It is only a recent public sample,
        // not a claim of sitewide or real-time trending rankings.
        const counts = new Map<string, number>();
        for (const row of feed.data ?? []) {
          const tags = new Set<string>();
          const body = typeof row.content === 'string' ? row.content : '';
          for (const match of body.matchAll(/#([\p{L}\p{N}_]{1,32})/gu)) {
            tags.add(match[1].toLocaleLowerCase());
          }
          tags.forEach(tag => counts.set(tag, (counts.get(tag) ?? 0) + 1));
        }
        if (!active) return;
        setTopics([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5).map(([tag, count]) => ({ tag, count })));
        setAccounts((people.data ?? []).filter((p): p is Account =>
          typeof p.id === 'string' && typeof p.handle === 'string' &&
          typeof p.display_name === 'string').filter(p => p.id !== id));
        setViewerId(id);
        setFollowing((followResponse?.data ?? []).map(item => item.following_id));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '暂时无法读取推荐内容');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [host]);

  function searchTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = term.trim().replace(/^#+/, '').slice(0, 32);
    if (!cleaned) return;
    router.push(`/explore?tag=${encodeURIComponent(cleaned)}`);
  }

  async function follow(id: string) {
    if (!viewerId || id === viewerId || busyId || following.includes(id)) return;
    setBusyId(id);
    setError('');
    try {
      const { error: followError } = await db().from('follows')
        .insert({ follower_id: viewerId, following_id: id });
      if (followError) throw followError;
      setFollowing(current => current.includes(id) ? current : [...current, id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '关注失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  if (!host) return null;
  const candidates = accounts.filter(account => !following.includes(account.id)).slice(0, 3);
  return createPortal(
    <div className="sf-discovery" aria-label="Starflow 发现更多">
      <form className="sf-discovery-search" role="search" onSubmit={searchTopic}>
        <Search size={19} aria-hidden="true" />
        <input aria-label="搜索话题" placeholder="搜索话题" value={term}
          onChange={event => setTerm(event.target.value)} maxLength={32} />
        <button type="submit" aria-label="提交话题搜索" disabled={!term.trim()}><Search size={17}/></button>
      </form>
      <section className="sf-discovery-card" aria-label="近期公开话题">
        <div className="sf-discovery-title"><Hash size={18}/><h3>近期公开话题</h3></div>
        <p className="sf-discovery-explainer">基于最近最多 150 条公开帖子统计，并非全站热搜。</p>
        {loading ? <p className="sf-discovery-empty">正在加载话题…</p>
          : topics.length ? topics.map((topic, index) =>
            <Link className="sf-topic" href={`/explore?tag=${encodeURIComponent(topic.tag)}`} key={topic.tag}>
              <span className="sf-topic-index">话题 · {index + 1}</span>
              <strong>#{topic.tag}</strong>
              <span className="sf-topic-count">近期 {topic.count} 条帖子</span>
            </Link>)
            : <p className="sf-discovery-empty">近期还没有带话题标签的公开帖子。</p>}
        <Link className="sf-discovery-more" href="/explore">探索更多 <span aria-hidden="true">→</span></Link>
      </section>
      <section className="sf-discovery-card" aria-label="推荐关注">
        <div className="sf-discovery-title"><UserPlus size={18}/><h3>推荐关注</h3></div>
        {loading ? <p className="sf-discovery-empty">正在加载账号…</p>
          : candidates.length ? candidates.map(account =>
            <div key={account.id} className="sf-person">
              <Link className="sf-person-link" href={`/profile/${encodeURIComponent(account.handle)}`}>
                <span className="sf-person-avatar" aria-hidden="true">
                  {account.avatar_url ? <img src={account.avatar_url} alt="" loading="lazy" />
                    : account.display_name.slice(0, 1)}
                </span>
                <span className="sf-person-name"><strong title={account.display_name}>{account.display_name}</strong>
                  <small>@{account.handle}</small></span>
              </Link>
              <button type="button" className="sf-person-follow" onClick={() => void follow(account.id)}
                disabled={!viewerId || !!busyId} aria-label={`关注 ${account.display_name}`}>
                {busyId === account.id ? '…' : '关注'}
              </button>
            </div>)
            : <p className="sf-discovery-empty">暂时没有可推荐的新账号。</p>}
        {error && <p className="sf-discovery-error" role="alert">{error}</p>}
        <Link className="sf-discovery-more" href="/explore">发现用户 <span aria-hidden="true">→</span></Link>
      </section>
      <section className="sf-discovery-card sf-discovery-special">
        <div className="sf-discovery-title"><Sparkles size={18}/><h3>Starflow 专属功能</h3></div>
        <Link href="/support">✦ AI 客服（访客也可使用）<span>↗</span></Link>
        <Link href="/verification">认证中心 · 蓝 / 金 / 灰<span>↗</span></Link>
        <Link href="/hub">社区与关注列表<span>↗</span></Link>
        <Link href="/creator">创作者数据<span>↗</span></Link>
      </section>
      <div className="sf-discovery-footer">
        <Link href="/terms">服务条款</Link><Link href="/privacy">隐私政策</Link>
        <span><Check size={13}/> Starflow 独立社区</span>
      </div>
    </div>, host,
  );
}
