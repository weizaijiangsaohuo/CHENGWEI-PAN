
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, ShieldBan } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';

type Profile = {
  id: string;
  handle: string;
  display_name: string;
};

type DM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export default function MessagesPage() {
  const [me, setMe] = useState<string | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasConfig()) {
      setError('Supabase 尚未配置');
      setLoading(false);
      return;
    }

    let active = true;
    const client = db();

    const updateUser = (id: string | null) => {
      if (!active) return;
      setMe(previous => {
        if (previous !== id) {
          setPeople([]);
          setMessages([]);
          setPeerId(null);
          setDraft('');
        }
        return id;
      });
      setLoading(false);
    };

    void client.auth.getUser().then(({ data, error }) => {
      if (error) setError(error.message);
      updateUser(data.user?.id ?? null);
    });

    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        updateUser(session?.user?.id ?? null);
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!me) return;

    const client = db();

    const [profilesResult, sentResult, receivedResult] =
      await Promise.all([
        client.from('profiles')
          .select('id,handle,display_name')
          .neq('id', me)
          .order('display_name')
          .limit(100),

        client.from('direct_messages')
          .select('*')
          .eq('sender_id', me)
          .order('created_at', { ascending: false })
          .limit(500),

        client.from('direct_messages')
          .select('*')
          .eq('recipient_id', me)
          .order('created_at', { ascending: false })
          .limit(500)
      ]);

    const failure =
      profilesResult.error ||
      sentResult.error ||
      receivedResult.error;

    if (failure) {
      setError('读取私信失败：' + failure.message);
      return;
    }

    const all = [
      ...(sentResult.data || []),
      ...(receivedResult.data || [])
    ] as DM[];

    const unique = Array.from(
      new Map(all.map(item => [item.id, item])).values()
    ).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    setPeople((profilesResult.data || []) as Profile[]);
    setMessages(unique);
    setError('');
  }, [me]);

  useEffect(() => {
    if (!me) return;

    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [me, refresh]);

  const peer = people.find(p => p.id === peerId) || null;

  useEffect(() => {
    if (!me || !peerId) return;

    let active = true;

    void db().from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', me)
      .eq('blocked_id', peerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setBlocked(Boolean(data));
      });

    return () => {
      active = false;
    };
  }, [me, peerId]);

  useEffect(() => {
    if (!me || !peerId) return;

    const unreadIds = messages
      .filter(m =>
        m.sender_id === peerId &&
        m.recipient_id === me &&
        !m.read_at
      )
      .map(m => m.id);

    if (!unreadIds.length) return;

    void db().from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', me)
      .in('id', unreadIds)
      .then(({ error }) => {
        if (error) setError('更新已读状态失败：' + error.message);
        else void refresh();
      });
  }, [me, peerId, messages, refresh]);

  async function send() {
    if (!me || !peerId || !draft.trim() || busy) return;

    setBusy(true);
    setError('');

    const { error: sendError } = await db()
      .from('direct_messages')
      .insert({
        sender_id: me,
        recipient_id: peerId,
        body: draft.trim()
      });

    setBusy(false);

    if (sendError) {
      setError('发送失败：' + sendError.message);
      return;
    }

    setDraft('');
    await refresh();
  }

  async function toggleBlock() {
    if (!me || !peerId || busy) return;

    setBusy(true);

    const client = db();

    const result = blocked
      ? await client.from('user_blocks')
          .delete()
          .eq('blocker_id', me)
          .eq('blocked_id', peerId)
      : await client.from('user_blocks')
          .insert({
            blocker_id: me,
            blocked_id: peerId
          });

    setBusy(false);

    if (result.error) {
      setError(result.error.message);
    } else {
      setBlocked(!blocked);
    }
  }

  const thread = messages.filter(m =>
    peerId && (
      (m.sender_id === me && m.recipient_id === peerId) ||
      (m.sender_id === peerId && m.recipient_id === me)
    )
  );

  const unreadFor = (id: string) =>
    messages.filter(m =>
      m.sender_id === id &&
      m.recipient_id === me &&
      !m.read_at
    ).length;

  const totalUnread = messages.filter(m =>
    m.recipient_id === me && !m.read_at
  ).length;

  const panel = {
    background: 'rgba(255,255,255,.85)',
    border: '1px solid #f4d9ed',
    borderRadius: 20,
    padding: 14,
    minWidth: 0,
    boxSizing: 'border-box' as const
  };

  const button = {
    border: '1px solid #e7b9df',
    borderRadius: 12,
    padding: '10px 12px',
    background: '#fff',
    color: '#92519e',
    cursor: 'pointer'
  };

  return (
    <main style={{
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      padding: '20px 12px 100px',
      background: 'linear-gradient(135deg,#fff0f8,#f2eaff,#e9f5ff)',
      color: '#56385f'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 980,
        minWidth: 0,
        margin: '0 auto'
      }}>
        <Link href="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 18
        }}>
          <ArrowLeft size={18} />
          返回 Starflow
        </Link>

        <h1 style={{fontSize: 27, margin: '0 0 8px'}}>
          ✦ 私信中心
          {totalUnread > 0 && (
            <span style={{
              marginLeft: 10,
              fontSize: 14,
              color: '#d81b60'
            }}>
              {totalUnread} 条未读
            </span>
          )}
        </h1>

        <p style={{marginBottom: 20}}>
          Starflow 2.0 · 一对一私密聊天
        </p>

        {error && (
          <p role="alert" style={{
            color: '#b91c55',
            overflowWrap: 'anywhere'
          }}>
            {error}
          </p>
        )}

        {loading ? (
          <div style={panel}>正在加载账号…</div>
        ) : !me ? (
          <div style={panel}>
            请先登录 Starflow，再打开私信中心。
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(min(100%,300px),1fr))',
            gap: 14,
            width: '100%',
            minWidth: 0
          }}>
            <section style={panel}>
              <h2 style={{fontSize: 18}}>
                聊天对象
              </h2>

              <div style={{display: 'grid', gap: 8}}>
                {people.map(p => {
                  const unread = unreadFor(p.id);
                  const last = messages
                    .filter(m =>
                      m.sender_id === p.id ||
                      m.recipient_id === p.id
                    )
                    .slice(-1)[0];

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPeerId(p.id);
                        setBlocked(false);
                        setError('');
                      }}
                      style={{
                        ...button,
                        minWidth: 0,
                        textAlign: 'left',
                        background: peerId === p.id
                          ? '#fce2f5' : '#fff'
                      }}
                    >
                      <span style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8
                      }}>
                        <strong>{p.display_name}</strong>
                        {unread > 0 && (
                          <strong style={{
                            background: '#e11d70',
                            color: 'white',
                            borderRadius: 20,
                            padding: '2px 8px'
                          }}>
                            {unread}
                          </strong>
                        )}
                      </span>

                      <small style={{
                        display: 'block',
                        overflowWrap: 'anywhere',
                        opacity: .7
                      }}>
                        @{p.handle}
                      </small>

                      {last && (
                        <small style={{
                          display: 'block',
                          marginTop: 5,
                          overflowWrap: 'anywhere'
                        }}>
                          {last.sender_id === me ? '我：' : ''}
                          {last.body.slice(0, 35)}
                        </small>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={panel}>
              {!peer ? (
                <p>请选择聊天对象，查看收到的消息。</p>
              ) : (
                <>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8
                  }}>
                    <h2 style={{fontSize: 18}}>
                      {peer.display_name}
                    </h2>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleBlock()}
                      style={button}
                    >
                      <ShieldBan size={15} />
                      {blocked ? '解除屏蔽' : '屏蔽用户'}
                    </button>
                  </div>

                  <div
                    aria-label="聊天记录"
                    style={{
                      height: 350,
                      minWidth: 0,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: 8
                    }}
                  >
                    {thread.length === 0 && (
                      <p>还没有聊天记录。</p>
                    )}

                    {thread.map(m => {
                      const mine = m.sender_id === me;

                      return (
                        <div key={m.id} style={{
                          alignSelf: mine
                            ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          minWidth: 0,
                          boxSizing: 'border-box',
                          padding: '10px 12px',
                          borderRadius: 15,
                          background: mine
                            ? '#f6cce9' : '#fff',
                          overflowWrap: 'anywhere',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {m.body}
                          <small style={{
                            display: 'block',
                            marginTop: 5,
                            opacity: .65
                          }}>
                            {new Date(m.created_at)
                              .toLocaleString('zh-CN')}
                            {mine
                              ? m.read_at
                                ? ' · 已读'
                                : ' · 已发送'
                              : ''}
                          </small>
                        </div>
                      );
                    })}
                  </div>

                  {blocked ? (
                    <p>你已屏蔽该用户。</p>
                  ) : (
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        void send();
                      }}
                      style={{
                        display: 'flex',
                        width: '100%',
                        minWidth: 0,
                        gap: 8
                      }}
                    >
                      <input
                        aria-label="输入消息"
                        value={draft}
                        onChange={e =>
                          setDraft(e.target.value)
                        }
                        maxLength={2000}
                        placeholder="输入消息…"
                        style={{
                          flex: 1,
                          width: 0,
                          minWidth: 0,
                          border: '1px solid #e7b9df',
                          borderRadius: 12,
                          padding: 10
                        }}
                      />

                      <button
                        type="submit"
                        disabled={busy || !draft.trim()}
                        style={{
                          ...button,
                          background: '#edb5dd'
                        }}
                      >
                        <Send size={18} />
                      </button>
                    </form>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
