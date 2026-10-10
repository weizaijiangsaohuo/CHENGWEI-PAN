'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db, hasConfig } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { ago } from '@/lib/types';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';
import { PollCard } from './PollCard';
import { PostGallery } from './PostGallery';

type ProfileTab = 'posts' | 'replies' | 'media';
type Connections = 'followers' | 'following';
type Counts = { followers: number | null; following: number | null };
type SupplementPost = {
  id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  image_url: string | null;
  video_url: string | null;
  has_poll: boolean;
  has_gallery: boolean;
};
type Slots = { info: Element | null; tabs: Element | null; posts: Element | null };

const emptyCounts: Counts = { followers: null, following: null };
const postColumns = 'id,content,created_at,parent_id,image_url,video_url,has_poll,has_gallery';

// This incremental enhancement uses the existing profile markup as its mounting
// point. It never modifies the original SocialApp, database tables or policies.
export function StarflowProfileEnhancements() {
  const pathname = usePathname();
  const handle = useMemo(() => {
    const match = /^\/profile\/([^/]+)\/?$/.exec(pathname ?? '');
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }, [pathname]);
  const [slots, setSlots] = useState<Slots>({ info: null, tabs: null, posts: null });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [connections, setConnections] = useState<Connections | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [peopleBadges, setPeopleBadges] = useState<Record<string, VerificationKind>>({});
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const [supplementPosts, setSupplementPosts] = useState<SupplementPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');

  useEffect(() => {
    if (!handle) { setSlots({ info: null, tabs: null, posts: null }); return; }
    const update = () => {
      const next: Slots = {
        info: document.querySelector('.app-frame .profile-info'),
        tabs: document.querySelector('.app-frame .tab-line'),
        posts: document.querySelector('.app-frame .posts-list'),
      };
      setSlots(previous => previous.info === next.info && previous.tabs === next.tabs && previous.posts === next.posts ? previous : next);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, [handle]);

  useEffect(() => {
    setTab('posts');
    setConnections(null);
    setPeople([]);
    setProfile(null);
    setCounts(emptyCounts);
  }, [handle]);

  // Only query when the signed-in profile page exists. The visitor auth screen
  // must not be modified, and no placeholder numbers are presented as real.
  useEffect(() => {
    if (!handle || !slots.info || !hasConfig()) return;
    let active = true;
    const load = async () => {
      try {
        const client = db();
        const { data, error } = await client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at')
          .eq('handle', handle).maybeSingle();
        if (error) throw error;
        if (!active) return;
        setProfile(data as Profile | null);
      } catch { if (active) setProfile(null); }
    };
    void load();
    return () => { active = false; };
  }, [handle, slots.info]);

  const fetchCounts = useCallback(async (profileId: string, active: () => boolean) => {
    try {
      const client = db();
      const [fans, follows] = await Promise.all([
        client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profileId),
        client.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profileId),
      ]);
      if (active()) setCounts({
        followers: fans.error ? null : fans.count ?? 0,
        following: follows.error ? null : follows.count ?? 0,
      });
    } catch { if (active()) setCounts(emptyCounts); }
  }, []);

  useEffect(() => {
    if (!profile || !hasConfig()) return;
    let active = true;
    setCounts(emptyCounts);
    void fetchCounts(profile.id, () => active);
    return () => { active = false; };
  }, [profile?.id, refresh, fetchCounts]);

  useEffect(() => {
    if (!profile || !connections || !hasConfig()) return;
    let active = true;
    setPeople([]);
    setPeopleBadges({});
    setPeopleError('');
    setPeopleLoading(true);
    const load = async () => {
      try {
        const client = db();
        const column = connections === 'followers' ? 'follower_id' : 'following_id';
        const filter = connections === 'followers' ? 'following_id' : 'follower_id';
        const { data, error } = await client.from('follows').select(column)
          .eq(filter, profile.id).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        const ids = [...new Set((data ?? []).map(item => (item as Record<string, unknown>)[column])
          .filter((id): id is string => typeof id === 'string'))];
        if (ids.length === 0) { if (active) setPeople([]); return; }
        const [users, badges] = await Promise.all([
          client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at').in('id', ids),
          client.from('account_verifications').select('profile_id,verification_type')
            .eq('status', 'approved').in('profile_id', ids),
        ]);
        if (users.error) throw users.error;
        const lookup = new Map(((users.data ?? []) as Profile[]).map(person => [person.id, person]));
        const ordered = ids.map(id => lookup.get(id)).filter((person): person is Profile => Boolean(person));
        const approved: Record<string, VerificationKind> = {};
        if (!badges.error) for (const badge of badges.data ?? []) {
          if (badge.verification_type === 'blue' || badge.verification_type === 'gold' || badge.verification_type === 'gray') {
            approved[badge.profile_id] = badge.verification_type as VerificationKind;
          }
        }
        if (active) { setPeople(ordered); setPeopleBadges(approved); }
      } catch (error) {
        if (active) setPeopleError(error instanceof Error ? error.message : '读取账号列表失败');
      } finally { if (active) setPeopleLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [profile?.id, connections, refresh]);

  useEffect(() => {
    if (!profile || tab === 'posts' || !hasConfig()) return;
    let active = true;
    setSupplementPosts([]);
    setPostsError('');
    setPostsLoading(true);
    const load = async () => {
      try {
        const client = db();
        let query = client.from('posts').select(postColumns).eq('author_id', profile.id);
        if (tab === 'replies') query = query.not('parent_id', 'is', null);
        if (tab === 'media') query = query.or('image_url.not.is.null,video_url.not.is.null,has_gallery.eq.true');
        const { data, error } = await query.order('created_at', { ascending: false }).limit(80);
        if (error) throw error;
        if (active) setSupplementPosts((data ?? []) as SupplementPost[]);
      } catch (error) { if (active) setPostsError(error instanceof Error ? error.message : '无法加载内容'); }
      finally { if (active) setPostsLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [profile?.id, tab]);

  // Keep original posts fully interactive on the 动态 tab; temporarily swap
  // only the visible list for the 回复 and 媒体 queries.
  useEffect(() => {
    const node = slots.posts;
    if (!node) return;
    if (tab === 'posts') node.removeAttribute('data-sf-profile-extra');
    else node.setAttribute('data-sf-profile-extra', 'true');
    return () => node.removeAttribute('data-sf-profile-extra');
  }, [slots.posts, tab]);

  if (!handle || !profile || !slots.info || !slots.tabs || !slots.posts) return null;
  const peopleTitle = connections === 'followers' ? '粉丝' : '正在关注';
  const visibleTotal = connections === 'followers' ? counts.followers : counts.following;
  return <>
    {createPortal(<div className="sf-profile-extra-connections">
      <div className="sf-profile-extra-counts" aria-label="真实关注统计">
        <button type="button" aria-expanded={connections === 'following'} onClick={() => setConnections(current => current === 'following' ? null : 'following')}>
          <strong>{counts.following === null ? '—' : counts.following.toLocaleString('zh-CN')}</strong> 正在关注
        </button>
        <button type="button" aria-expanded={connections === 'followers'} onClick={() => setConnections(current => current === 'followers' ? null : 'followers')}>
          <strong>{counts.followers === null ? '—' : counts.followers.toLocaleString('zh-CN')}</strong> 位粉丝
        </button>
        <button type="button" className="sf-extra-refresh" title="重新读取关注统计" onClick={() => setRefresh(value => value + 1)}>↻ 刷新</button>
      </div>
      {connections && <section className="sf-extra-connections-list" aria-label={peopleTitle}>
        <div className="sf-extra-people-top"><strong>{peopleTitle}</strong><button type="button" onClick={() => setConnections(null)}>关闭 ×</button></div>
        {peopleLoading ? <p role="status">正在读取账号…</p>
          : peopleError ? <p role="alert">{peopleError}</p>
          : people.length === 0 ? <p>这里还没有{peopleTitle}账号。</p>
          : <>{people.map(person => <div key={person.id} className="sf-extra-person">
              <Link href={'/profile/' + encodeURIComponent(person.handle)} className="sf-extra-person-link">
                <span className="sf-extra-person-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" loading="lazy" /> : person.display_name.slice(0, 1)}</span>
                <span className="sf-extra-person-info"><span className="sf-extra-person-name"><strong>{person.display_name}</strong></span><small>@{person.handle}</small>{person.bio && <span className="sf-extra-person-bio">{person.bio}</span>}</span>
              </Link>
              <VerificationBadge kind={peopleBadges[person.id]} size={16}/>
            </div>)}{visibleTotal !== null && visibleTotal > 50 && <p>当前展示最近 50 位账号。</p>}</>}
      </section>}
    </div>, slots.info)}
    {createPortal(<nav className="sf-extra-profile-tabs" role="tablist" aria-label="个人主页内容分类">
      {([['posts','动态'],['replies','回复'],['media','媒体']] as const).map(([key, title]) =>
        <button key={key} type="button" role="tab" aria-selected={tab === key} aria-controls={key === 'posts' ? undefined : 'sf-profile-extra-feed'} onClick={() => setTab(key)}>{title}</button>)}
    </nav>, slots.tabs)}
    {tab !== 'posts' && createPortal(<section className="sf-profile-extra-posts" id="sf-profile-extra-feed" role="tabpanel" aria-label={tab === 'replies' ? '回复列表' : '媒体列表'}>
      {postsLoading ? <p className="sf-profile-extra-state" role="status">正在加载{tab === 'replies' ? '回复' : '媒体'}…</p>
      : postsError ? <p className="sf-profile-extra-state" role="alert">{postsError}</p>
      : supplementPosts.length === 0 ? <p className="sf-profile-extra-state">这里还没有{tab === 'replies' ? '回复' : '媒体内容'}。</p>
      : supplementPosts.map(post => <article className="sf-extra-post" key={post.id}>
        <div className="sf-extra-post-heading"><span className="sf-extra-person-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy"/> : profile.display_name.slice(0,1)}</span>
          <div><strong>{profile.display_name}</strong> <span>@{profile.handle} · {ago(post.created_at)}</span>
            {post.parent_id && <Link className="sf-extra-parent-link" href={'/post/' + encodeURIComponent(post.parent_id)}>↪ 查看回复的原帖</Link>}
          </div>
        </div>
        <div className="sf-extra-post-content">{post.content}</div>
        {post.has_gallery ? <PostGallery postId={post.id} fallback={post.image_url}/>
          : post.image_url && <a className="sf-extra-post-picture" href={post.image_url} rel="noopener noreferrer" target="_blank"><img src={post.image_url} alt="动态图片" loading="lazy"/></a>}
        {post.has_poll && <PollCard postId={post.id}/>}
        {post.video_url && <video className="sf-extra-post-video" src={post.video_url} controls playsInline preload="metadata" aria-label="动态视频"/>}
        <Link className="sf-extra-post-link" href={'/post/' + encodeURIComponent(post.id)}>查看帖子与互动 →</Link>
      </article>)}
      {supplementPosts.length >= 80 && <p className="sf-profile-extra-state">当前最多展示最近 80 条内容。</p>}
    </section>, slots.posts)}
  </>;
}
