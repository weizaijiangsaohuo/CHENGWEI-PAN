'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, CheckCheck, Home, LoaderCircle, MessageCircle, Search, Send, UserRound, X } from 'lucide-react';
import { Brand } from './Brand';
import { db, hasConfig } from '@/lib/supabase';
import { useLanguage } from './LanguageProvider';

type Conversation = {
  id: string;
  user_low: string;
  user_high: string;
  created_at: string;
  last_message_at: string | null;
  last_sender_id: string | null;
};
type Contact = { id: string; handle: string; display_name: string; avatar_url: string | null };
type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function ContactAvatar({ person }: { person?: Contact }) {
  return <span className="sf-dm-avatar">
    {person?.avatar_url
      ? <img src={person.avatar_url} alt="" loading="lazy" />
      : (person?.display_name?.slice(0, 1) || '?')}
  </span>;
}

export function StarflowMessages() {
  const { lang } = useLanguage();
  const en = lang === 'en';
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [readStates, setReadStates] = useState<Record<string, string>>({});
  const [peerReadStates, setPeerReadStates] = useState<Record<string, string>>({});
  const [blockedPeerIds, setBlockedPeerIds] = useState<string[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const autoOpen = useRef(false);
  const activeRef = useRef<string | null>(null);
  const lastMarked = useRef<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!hasConfig()) { setChecking(false); return; }
    let valid = true;
    const client = db();
    void client.auth.getUser().then(({ data, error: authError }) => {
      if (valid) { setUser(authError ? null : data.user); setChecking(false); }
    }).catch(() => { if (valid) setChecking(false); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (valid) { setUser(session?.user ?? null); setChecking(false); }
    });
    return () => { valid = false; subscription.unsubscribe(); };
  }, []);

  const loadInbox = useCallback(async () => {
    if (!user) return;
    setLoadingInbox(true);
    try {
      const client = db();
      const [inbox, receipts, blocks] = await Promise.all([
        client.from('dm_conversations').select('id,user_low,user_high,created_at,last_message_at,last_sender_id')
          .or('user_low.eq.' + user.id + ',user_high.eq.' + user.id)
          .order('last_message_at', { ascending: false, nullsFirst: false }).limit(80),
        client.from('dm_read_state').select('conversation_id,user_id,last_read_at'),
        client.from('dm_blocks').select('blocked_id').eq('blocker_id', user.id),
      ]);
      if (inbox.error) throw inbox.error;
      if (receipts.error) throw receipts.error;
      if (blocks.error) throw blocks.error;
      const records = (inbox.data ?? []) as Conversation[];
      const peerIds = [...new Set(records.map(c => c.user_low === user.id ? c.user_high : c.user_low))];
      if (peerIds.length) {
        const people = await client.from('profiles').select('id,handle,display_name,avatar_url')
          .in('id', peerIds);
        if (people.error) throw people.error;
        setContacts(previous => ({
          ...previous,
          ...Object.fromEntries(((people.data ?? []) as Contact[]).map(p => [p.id, p])),
        }));
      }
      setConversations(records);
      setReadStates(previous => {
        const next = { ...previous };
        for (const item of receipts.data ?? []) {
          if (item.user_id === user.id && (!next[item.conversation_id] || next[item.conversation_id] < item.last_read_at))
            next[item.conversation_id] = item.last_read_at;
        }
        return next;
      });
      setPeerReadStates(Object.fromEntries((receipts.data ?? [])
        .filter(item => item.user_id !== user.id).map(item => [item.conversation_id, item.last_read_at])));
      setBlockedPeerIds((blocks.data ?? []).map(item => item.blocked_id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取私信失败');
    } finally {
      setLoadingInbox(false);
    }
  }, [user?.id]);

  const loadThread = useCallback(async (conversationId: string) => {
    if (!user) return;
    setLoadingThread(true);
    try {
      const { data, error: readError } = await db().from('dm_messages')
        .select('id,conversation_id,sender_id,body,created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(100);
      if (readError) throw readError;
      if (activeRef.current !== conversationId) return;
      const rows = ((data ?? []) as DirectMessage[]).reverse();
      setMessages(rows);
      const lastIncoming = [...rows].reverse().find(row => row.sender_id !== user.id);
      if (lastIncoming && lastMarked.current[conversationId] !== lastIncoming.id) {
        const { error: markError } = await db().rpc('sf_dm_mark_read', { p_conversation: conversationId });
        if (!markError) {
          lastMarked.current[conversationId] = lastIncoming.id;
          setReadStates(previous => ({ ...previous, [conversationId]: new Date().toISOString() }));
        }
      }
    } catch (reason) {
      if (activeRef.current === conversationId)
        setError(reason instanceof Error ? reason.message : '读取消息失败');
    } finally {
      if (activeRef.current === conversationId) setLoadingThread(false);
    }
  }, [user?.id]);

  const openConversation = useCallback(async (recipientId: string) => {
    if (!user || opening || recipientId === user.id) return;
    setOpening(true);
    setError('');
    try {
      const { data, error: openError } = await db().rpc('sf_dm_open', { p_recipient: recipientId });
      if (openError) throw openError;
      if (typeof data !== 'string') throw new Error('会话创建失败');
      activeRef.current = data;
      setActiveId(data);
      setSearch('');
      setSearchResults([]);
      await loadInbox();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建会话失败');
    } finally {
      setOpening(false);
    }
  }, [user?.id, opening, loadInbox]);

  useEffect(() => { if (user) void loadInbox(); }, [user?.id, loadInbox]);
  useEffect(() => {
    if (!activeId || !user) { setCanSend(false); return; }
    let live = true;
    setCanSend(false);
    void Promise.resolve(db().rpc('sf_dm_can_send', { p_conversation: activeId })).then(({ data, error: permissionError }) => {
      if (live) setCanSend(!permissionError && data === true);
    }).catch(() => { if (live) setCanSend(false); });
    return () => { live = false; };
  }, [activeId, user?.id, blockedPeerIds]);
  useEffect(() => {
    activeRef.current = activeId;
    setMessages([]);
    if (activeId) void loadThread(activeId);
  }, [activeId, loadThread]);
  useEffect(() => {
    if (!user) return;
    const refresh = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadInbox();
      if (activeRef.current) void loadThread(activeRef.current);
    }, 10000);
    return () => window.clearInterval(refresh);
  }, [user?.id, loadInbox, loadThread]);

  // Realtime listens only to the current user's conversations. Subscriptions are
  // removed on logout/unmount; polling remains a fallback for mobile Safari.
  useEffect(() => {
    if (!user) return;
    const client = db();
    let timer: number | null = null;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void loadInbox();
      }, 130);
    };
    const inboxChannel = client.channel('sf-dm-inbox-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dm_conversations',
        filter: 'user_low=eq.' + user.id,
      }, refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dm_conversations',
        filter: 'user_high=eq.' + user.id,
      }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const resume = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      void client.removeChannel(inboxChannel);
    };
  }, [user?.id, loadInbox]);

  // Open-thread events are filtered by conversation_id. RLS ensures only the
  // two participants can receive or fetch their private message contents.
  useEffect(() => {
    if (!user || !activeId) return;
    const client = db();
    let timer: number | null = null;
    const refreshThread = () => {
      if (document.visibilityState === 'hidden') return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void loadThread(activeId);
        void loadInbox();
      }, 120);
    };
    const refreshReceipts = () => { if (document.visibilityState !== 'hidden') void loadInbox(); };
    const threadChannel = client.channel('sf-dm-thread-' + activeId + '-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dm_messages',
        filter: 'conversation_id=eq.' + activeId,
      }, refreshThread)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dm_read_state',
        filter: 'conversation_id=eq.' + activeId,
      }, refreshReceipts)
      .subscribe(status => { if (status === 'SUBSCRIBED') refreshThread(); });
    const resume = () => { if (document.visibilityState === 'visible') refreshThread(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      void client.removeChannel(threadChannel);
    };
  }, [user?.id, activeId, loadThread, loadInbox]);

  useEffect(() => {
    if (!user || autoOpen.current) return;
    autoOpen.current = true;
    const handle = new URLSearchParams(window.location.search).get('to');
    if (!handle || !/^[a-z0-9_]{3,24}$/.test(handle)) return;
    let valid = true;
    void db().from('profiles').select('id,handle,display_name,avatar_url')
      .eq('handle', handle).maybeSingle().then(({ data, error: lookupError }) => {
        if (!valid || lookupError || !data || data.id === user.id) return;
        setContacts(previous => ({ ...previous, [data.id]: data as Contact }));
        void openConversation(data.id);
        window.history.replaceState(window.history.state, '', '/messages');
      });
    return () => { valid = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !search.trim()) { setSearchResults([]); setSearching(false); return; }
    let valid = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const cleaned = search.trim().toLowerCase().replace(/[%\\]/g, '').slice(0, 24);
      if (!cleaned) { if (valid) { setSearchResults([]); setSearching(false); } return; }
      const { data, error: searchError } = await db().from('profiles')
        .select('id,handle,display_name,avatar_url').ilike('handle', cleaned + '%').limit(12);
      if (valid) {
        setSearchResults(searchError ? [] : ((data ?? []) as Contact[]).filter(p => p.id !== user.id));
        setSearching(false);
        if (searchError) setError(searchError.message);
      }
    }, 280);
    return () => { valid = false; window.clearTimeout(timer); };
  }, [user?.id, search]);

  useEffect(() => {
    if (activeId) endRef.current?.scrollIntoView({ block: 'end' });
  }, [activeId, messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !activeId || !canSend || sendingRef.current) return;
    const body = draft.trim();
    if (body.length < 1 || body.length > 2000) {
      setError(en ? 'Message must be 1–2000 characters.' : '私信内容须为 1–2000 个字符。');
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const { error: sendError } = await db().from('dm_messages').insert({
        conversation_id: activeId, sender_id: user.id, body,
      });
      if (sendError) throw sendError;
      setDraft('');
      await Promise.all([loadThread(activeId), loadInbox()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发送失败，请重试');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const current = conversations.find(c => c.id === activeId);
  const peerId = current && user ? (current.user_low === user.id ? current.user_high : current.user_low) : null;
  const peer = peerId ? contacts[peerId] : undefined;
  const blockedByMe = Boolean(peerId && blockedPeerIds.includes(peerId));
  const lastOwnMessageId = [...messages].reverse().find(message => message.sender_id === user?.id)?.id;
  async function toggleBlock() {
    if (!user || !peerId || blocking) return;
    if (!blockedByMe && !window.confirm(en ? 'Block this user? Neither of you will be able to send new messages until you unblock.' : '确定拉黑此用户？解除拉黑前，双方都无法继续发送私信。')) return;
    setBlocking(true);
    setError('');
    try {
      const result = blockedByMe
        ? await db().from('dm_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', peerId)
        : await db().from('dm_blocks').insert({ blocker_id: user.id, blocked_id: peerId });
      if (result.error) throw result.error;
      setBlockedPeerIds(previous => blockedByMe
        ? previous.filter(id => id !== peerId)
        : [...new Set([...previous, peerId])]);
      setCanSend(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (en ? 'Action failed' : '操作失败'));
    } finally {
      setBlocking(false);
    }
  }
  const isUnread = (c: Conversation) => Boolean(user && c.last_message_at &&
    c.last_sender_id !== user.id && (!readStates[c.id] || c.last_message_at > readStates[c.id]));

  if (checking) return <main className="sf-dm-state"><LoaderCircle className="sf-dm-spin" /> {en ? 'Loading…' : '正在加载…'}</main>;
  if (!user || !hasConfig()) return <main className="sf-dm-state"><MessageCircle size={34}/>
    <h1>{en ? 'Sign in to use messages' : '登录后使用私信'}</h1>
    <p>{en ? 'Your conversations are only available to their participants.' : '私信仅会话双方可以读取。请先登录星流。'}</p>
    <Link href="/" className="sf-dm-primary">{en ? 'Sign in' : '返回登录'}</Link>
  </main>;

  return <div className="sf-dm-page">
    <header className="sf-dm-global"><Brand compact/><nav aria-label="星流导航">
      <Link href="/"><Home size={19}/><span>{en ? 'Home' : '首页'}</span></Link>
      <Link href="/explore"><Search size={19}/><span>{en ? 'Explore' : '探索'}</span></Link>
      <Link href="/settings" className="sf-dm-profile-shortcut"><UserRound size={19}/><span>{en ? 'Settings' : '设置'}</span></Link>
    </nav></header>
    <div className={'sf-dm-shell' + (activeId ? ' sf-dm-has-thread' : '')}>
      <aside className="sf-dm-list-panel" aria-label={en ? 'Conversations' : '会话列表'}>
        <div className="sf-dm-list-head"><div><h1>{en ? 'Messages' : '私信'}</h1>
          <p>{en ? 'Private conversations' : '只与会话双方共享'}</p></div>
          <button type="button" title={en ? 'Refresh inbox' : '刷新私信'} onClick={() => void loadInbox()} disabled={loadingInbox}>
            <CheckCheck size={20}/></button>
        </div>
        <div className="sf-dm-search"><Search size={18}/><input type="search"
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={en ? 'Search a username…' : '搜索用户名，发起私信…'}
          aria-label={en ? 'Search a username' : '搜索用户名'}/>
          {search && <button type="button" aria-label="清除搜索" onClick={() => setSearch('')}><X size={16}/></button>}
        </div>
        {search.trim() ? <div className="sf-dm-search-results">
          {searching && <p className="sf-dm-muted">{en ? 'Searching…' : '正在搜索…'}</p>}
          {!searching && searchResults.length === 0 && <p className="sf-dm-muted">{en ? 'No users found' : '没有找到匹配用户'}</p>}
          {searchResults.map(p => <button type="button" key={p.id} disabled={opening}
            onClick={() => { setContacts(previous => ({...previous, [p.id]: p})); void openConversation(p.id); }}>
            <ContactAvatar person={p}/><span><strong>{p.display_name}</strong><small>@{p.handle}</small></span><Send size={16}/>
          </button>)}
        </div> : <div className="sf-dm-inbox" role="list">
          {loadingInbox && conversations.length === 0 && <p className="sf-dm-muted">{en ? 'Loading conversations…' : '正在读取会话…'}</p>}
          {!loadingInbox && conversations.length === 0 && <div className="sf-dm-empty-inbox"><MessageCircle size={34}/>
            <h2>{en ? 'No conversations yet' : '还没有私信'}</h2>
            <p>{en ? 'Search a username above to start a conversation.' : '在上方搜索用户名，开始第一段对话。'}</p>
          </div>}
          {conversations.map(c => {
            const otherId = c.user_low === user.id ? c.user_high : c.user_low;
            const person = contacts[otherId];
            return <button type="button" role="listitem" key={c.id}
              className={'sf-dm-conversation' + (activeId === c.id ? ' sf-dm-selected' : '')}
              onClick={() => setActiveId(c.id)}>
              <ContactAvatar person={person}/>
              <span className="sf-dm-conversation-body"><span className="sf-dm-conversation-title">
                <strong>{person?.display_name || (en ? 'Account' : '用户')}</strong>
                {isUnread(c) && <span className="sf-dm-unread" aria-label="未读"/>}
              </span>
              <small>{person ? '@' + person.handle : '…'}</small>
              <small>{c.last_message_at ? new Date(c.last_message_at).toLocaleString(en ? 'en-US' : 'zh-CN', {
                month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit',
              }) : (en ? 'New conversation' : '新会话')}</small>
              </span>
            </button>;
          })}
        </div>}
      </aside>
      <section className="sf-dm-thread-panel" aria-label={en ? 'Chat' : '聊天内容'}>
        {activeId ? <>
          <div className="sf-dm-thread-head">
            <button type="button" className="sf-dm-back" onClick={() => setActiveId(null)}
              aria-label={en ? 'Back to conversations' : '返回会话列表'}><ArrowLeft size={22}/></button>
            <ContactAvatar person={peer}/><div className="sf-dm-thread-user">
              <strong>{peer?.display_name || (en ? 'Conversation' : '私信会话')}</strong>
              <small>{peer ? '@' + peer.handle : (en ? 'Private chat' : '私人聊天')}</small>
            </div>
            {peer && <Link href={'/profile/' + encodeURIComponent(peer.handle)} aria-label={en ? 'View profile' : '查看资料'}><UserRound size={20}/></Link>}
            {peer && <button type="button" className="sf-dm-block-control" disabled={blocking}
              onClick={() => void toggleBlock()}>{blocking ? (en ? 'Working…' : '处理中…') :
                blockedByMe ? (en ? 'Unblock' : '解除拉黑') : (en ? 'Block' : '拉黑')}</button>}
          </div>
          <div className="sf-dm-thread-messages" role="log" aria-live="polite" aria-label="消息内容">
            {loadingThread && messages.length === 0 && <p className="sf-dm-muted">{en ? 'Loading messages…' : '正在读取消息…'}</p>}
            {!loadingThread && messages.length === 0 && <div className="sf-dm-thread-empty">
              {en ? 'Send the first message.' : '发送第一条私信，开始聊天。'}</div>}
            {messages.map(m => <div key={m.id} className={'sf-dm-message' + (m.sender_id === user.id ? ' sf-dm-own' : '')}>
              <span className="sf-dm-bubble">{m.body}</span>
              <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString(en ? 'en-US' : 'zh-CN', {hour:'2-digit',minute:'2-digit'})}</time>
              {m.id === lastOwnMessageId && m.sender_id === user.id && peerReadStates[m.conversation_id] &&
                peerReadStates[m.conversation_id] >= m.created_at &&
                <small className="sf-dm-read-receipt">{en ? 'Read' : '已读'}</small>}
            </div>)}
            {sending && <p className="sf-dm-sending">{en ? 'Sending…' : '正在发送…'}</p>}
            <div ref={endRef}/>
          </div>
          {!canSend && !loadingThread && <p className="sf-dm-send-restricted">
            {en ? 'You cannot send messages in this conversation at the moment.' : '当前会话暂时无法发送私信。'}
          </p>}
          <form onSubmit={send} className="sf-dm-compose">
            <label htmlFor="sf-dm-input" className="sf-dm-sr-only">{en ? 'Message' : '私信内容'}</label>
            <textarea id="sf-dm-input" value={draft} onChange={e => setDraft(e.target.value)}
              maxLength={2000} rows={2} disabled={!canSend} placeholder={en ? 'Write a private message…' : '发送私信…'}
              onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault(); e.currentTarget.form?.requestSubmit();}}}/>
            <button type="submit" disabled={!canSend || sending || !draft.trim() || draft.trim().length > 2000}
              aria-label={en ? 'Send message' : '发送私信'}><Send size={20}/></button>
          </form>
        </> : <div className="sf-dm-pick"><MessageCircle size={46}/>
          <h2>{en ? 'Your private conversations' : '你的私人对话'}</h2>
          <p>{en ? 'Choose a conversation or search for someone on the left.' : '在左侧选择会话，或搜索用户名开始私信。'}</p>
        </div>}
      </section>
    </div>
    {error && <div className="sf-dm-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="关闭"><X size={18}/></button></div>}
  </div>;
}
