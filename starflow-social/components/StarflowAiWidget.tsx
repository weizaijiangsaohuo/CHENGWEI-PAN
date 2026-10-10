'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Clock3, History, MessageCirclePlus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { db } from '@/lib/supabase';

type Line = { id?: string; role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type ApiResponse = {
  reply?: unknown; error?: unknown; warning?: unknown; saved?: unknown; conversationId?: unknown;
  conversations?: Conversation[]; messages?: Line[];
};

type Props = { signedIn: boolean; onSignIn: () => void; en: boolean };

export function StarflowAiWidget({ signedIn, onSignIn, en }: Props) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [lines, busy, open]);

  useEffect(() => {
    if (signedIn) return;
    loadId.current += 1;
    setActiveId(null);
    setSessions([]);
    setLines([]);
    setShowHistory(false);
    setError('');
    setNotice('');
  }, [signedIn]);

  async function request(method: string, endpoint: string, body?: object): Promise<ApiResponse> {
    const { data: { session }, error: sessionError } = await db().auth.getSession();
    if (sessionError || !session?.access_token) {
      throw Error(en ? 'Please sign in again.' : '登录状态已失效，请重新登录。');
    }
    const response = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store'
    });
    const data = await response.json() as ApiResponse;
    if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'AI 服务暂时不可用');
    return data;
  }

  async function refreshList() {
    try {
      const data = await request('GET', '/api/ai');
      setSessions(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取历史对话');
    }
  }

  useEffect(() => {
    if (!open || !signedIn) return;
    void refreshList();
    // Do not overwrite current messages automatically; history is loaded on selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn]);

  async function selectConversation(id: string) {
    if (busy || loading) return;
    const seq = ++loadId.current;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await request('GET', `/api/ai?conversationId=${encodeURIComponent(id)}`);
      if (loadId.current !== seq) return;
      setLines(Array.isArray(data.messages) ? data.messages.filter(x => x.role === 'user' || x.role === 'assistant') : []);
      setActiveId(id);
      setShowHistory(false);
    } catch (caught) {
      if (loadId.current === seq) setError(caught instanceof Error ? caught.message : '加载历史对话失败');
    } finally {
      if (loadId.current === seq) setLoading(false);
    }
  }

  function newConversation() {
    if (busy || loading) return;
    loadId.current += 1;
    setActiveId(null);
    setLines([]);
    setInput('');
    setError('');
    setNotice('');
    setShowHistory(false);
  }

  async function deleteConversation(id: string) {
    if (busy || loading) return;
    if (!window.confirm(en ? 'Delete this conversation permanently?' : '确定永久删除这段 AI 聊天记录吗？')) return;
    setError('');
    try {
      await request('DELETE', `/api/ai?conversationId=${encodeURIComponent(id)}`);
      setSessions(prev => prev.filter(x => x.id !== id));
      if (activeId === id) newConversation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!signedIn || !message || message.length > 600 || busy || loading) return;
    const targetId = activeId;
    setError('');
    setNotice('');
    setInput('');
    setLines(prev => [...prev, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const data = await request('POST', '/api/ai', {
        message, save: true, ...(targetId ? { conversationId: targetId } : {})
      });
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('AI 没有返回有效回复');
      setLines(prev => [...prev, { role: 'assistant', content: data.reply as string }]);
      if (typeof data.warning === 'string') setNotice(data.warning);
      if (data.saved !== true) setNotice(en ? 'Reply received, but this conversation was NOT saved.' : '已收到回复，但本次对话未保存到数据库。');
      if (data.saved === true && typeof data.conversationId === 'string') {
        setActiveId(data.conversationId);
        await refreshList();
      }
    } catch (caught) {
      setLines(prev => prev.slice(0, -1));
      setInput(message);
      setError(caught instanceof Error ? caught.message : '发送失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <style>{`
      .sfai-launcher{position:fixed;z-index:90;right:max(12px,env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom));max-width:calc(100vw - 24px);border:1px solid rgba(255,255,255,.76);border-radius:999px;padding:12px 16px;display:flex;align-items:center;gap:8px;background:linear-gradient(117deg,#477eea,#8263e3 60%,#a86fdc);color:white;font-size:13px;font-weight:750;box-shadow:0 12px 30px rgba(72,79,185,.29);cursor:pointer;white-space:nowrap}
      .sfai-panel{position:fixed;z-index:91;right:max(12px,env(safe-area-inset-right));bottom:calc(138px + env(safe-area-inset-bottom));width:392px;max-width:calc(100vw - 24px);height:min(580px,calc(100dvh - 165px));box-sizing:border-box;min-width:0;display:flex;flex-direction:column;border:1px solid #e1e6f5;border-radius:24px;overflow:hidden;color:#202843;background:rgba(255,255,255,.97);box-shadow:0 22px 68px rgba(49,66,135,.23)}
      .sfai-panel *{box-sizing:border-box;min-width:0}
      .sfai-header{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid #e6eaf4;background:#fff}
      .sfai-mark{height:36px;width:36px;flex:none;border-radius:12px;background:linear-gradient(140deg,#63cced,#6782eb,#a777e7);color:white;display:grid;place-items:center;font-size:21px}
      .sfai-headtitle{flex:1;min-width:0}.sfai-headtitle strong{font-size:14px}.sfai-headtitle small{display:block;color:#7e88a8;font-size:10px;margin-top:3px}
      .sfai-iconbtn{flex:none;display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:#f3f5fc;color:#586482;cursor:pointer}
      .sfai-iconbtn:hover{background:#e8edff}.sfai-iconbtn:disabled{opacity:.4}
      .sfai-sessions{display:flex;flex-direction:column;gap:7px;padding:12px;overflow-y:auto;max-height:42%;flex:none;border-bottom:1px solid #e6eaf4;background:#f9faff}
      .sfai-sessionshead{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#7a8198;font-weight:700;margin-bottom:4px}
      .sfai-session{display:flex;align-items:center;gap:6px;width:100%}
      .sfai-session > button:first-child{border:0;background:transparent;flex:1;min-height:36px;min-width:0;padding:6px 8px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:9px;color:#404c74;font-size:12px}
      .sfai-session.current > button:first-child{background:#e9edff;color:#3654be}
      .sfai-session button:last-child{border:0;background:transparent;padding:8px;color:#9e6571;display:grid;place-items:center}
      .sfai-body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:16px 12px;background:#fafbff}
      .sfai-welcome{font-size:13px;line-height:1.85;color:#64708d;margin:5px 0 16px}
      .sfai-line{padding:11px 13px;border-radius:15px;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin-bottom:10px;max-width:94%}
      .sfai-line.user{margin-left:auto;background:#e6e9ff;border-bottom-right-radius:5px}
      .sfai-line.assistant{margin-right:auto;background:white;border:1px solid #e3e8f6;border-bottom-left-radius:5px}
      .sfai-alert{padding:8px 12px;font-size:12px;line-height:1.5;margin:0;flex:none;overflow-wrap:anywhere}
      .sfai-alert.error{color:#b63f4c;background:#fff1f3}.sfai-alert.notice{color:#996015;background:#fff8e8}
      .sfai-inputrow{flex:none;display:flex;gap:8px;align-items:center;padding:10px 12px;background:white;border-top:1px solid #e6eaf4}
      .sfai-inputrow input{flex:1;width:100%;min-width:0;border:1px solid #dbe2f6;background:white;border-radius:999px;padding:12px 14px;outline:none;color:#202843;font-size:16px}
      .sfai-inputrow button{flex:none;display:grid;place-items:center;height:42px;width:42px;border:0;border-radius:50%;background:#677ee3;color:#fff}
      .sfai-login{display:grid;gap:10px;justify-items:stretch;padding:22px 18px}.sfai-login p{text-align:center;color:#525d78;line-height:1.8}.sfai-login button{border:0;padding:12px;border-radius:24px;background:#617ce6;color:white;font-weight:700}
      .sfai-login button:last-child{background:transparent;color:#76809b}
      @media(min-width:651px){.sfai-launcher{bottom:24px;right:24px}.sfai-panel{right:24px;bottom:87px}}
      @media(max-width:650px){html,body{max-width:100%;overflow-x:clip}.app-frame,.app-layout,.feed-panel{min-width:0;max-width:100%}.sfai-panel{left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));width:auto;max-width:none;bottom:calc(74px + env(safe-area-inset-bottom));height:min(650px,calc(100dvh - 105px));border-radius:20px}.sfai-launcher{right:12px;bottom:calc(72px + env(safe-area-inset-bottom));font-size:12px;padding:11px 13px}}
      @media(prefers-reduced-motion:reduce){.sfai-panel,.sfai-launcher{scroll-behavior:auto}}
    `}</style>
    {open && <section className="sfai-panel" role="dialog" aria-modal="false" aria-label="Starflow AI">
      <header className="sfai-header">
        <span className="sfai-mark" aria-hidden="true">✦</span>
        <div className="sfai-headtitle"><strong>Starflow AI</strong><small>{en ? 'AI assistant · Chat history' : '星流智能助手 · 历史对话'}</small></div>
        {signedIn && <>
          <button type="button" className="sfai-iconbtn" onClick={newConversation} title={en ? 'New chat' : '新对话'} disabled={busy || loading}><MessageCirclePlus size={18}/></button>
          <button type="button" className="sfai-iconbtn" onClick={() => setShowHistory(value => !value)} title={en ? 'Chat history' : '历史记录'}><History size={18}/></button>
        </>}
        <button type="button" className="sfai-iconbtn" onClick={() => setOpen(false)} title={en ? 'Close' : '关闭'} aria-label={en ? 'Close' : '关闭'}><X size={18}/></button>
      </header>
      {signedIn && showHistory && <nav className="sfai-sessions" aria-label={en ? 'Conversations' : '历史对话'}>
        <div className="sfai-sessionshead"><span>{en ? 'Saved conversations' : '已保存的对话（最近 50 条）'}</span><Clock3 size={15}/></div>
        {sessions.length === 0 && <div className="sfai-welcome">{en ? 'No saved conversations yet.' : '暂时没有聊天记录，发送一条消息即可开始。'}</div>}
        {sessions.map(item => <div className={`sfai-session ${activeId === item.id ? 'current' : ''}`} key={item.id}>
          <button type="button" onClick={() => void selectConversation(item.id)} disabled={busy || loading} title={item.title}>{item.title}</button>
          <button type="button" onClick={() => void deleteConversation(item.id)} disabled={busy || loading} title={en ? 'Delete' : '删除'} aria-label={en ? 'Delete chat' : '删除对话'}><Trash2 size={15}/></button>
        </div>)}
      </nav>}
      {!signedIn ? <div className="sfai-login">
        <p>{en ? 'Please sign in to chat and save your history.' : '登录后即可与星流 AI 对话，并安全保存历史记录。'}</p>
        <button type="button" onClick={() => { setOpen(false); onSignIn(); }}>{en ? 'Sign in / Register' : '登录 / 注册'}</button>
        <button type="button" onClick={() => setOpen(false)}>{en ? 'Maybe later' : '稍后再说'}</button>
      </div> : <>
        <div ref={scrollRef} className="sfai-body" aria-live="polite">
          {!loading && !lines.length && <p className="sfai-welcome">{en ? 'Hello! Start a conversation. Chats are saved to your account.' : '你好！我是 ✦ 星流 AI。开始提问后，对话会保存到你的账号，点击右上角历史按钮可查看。'}</p>}
          {loading && <div className="sfai-welcome">{en ? 'Loading history…' : '正在读取聊天记录…'}</div>}
          {lines.map((line, index) => <div key={line.id ?? index} className={`sfai-line ${line.role}`}>{line.content}</div>)}
          {busy && <div className="sfai-welcome" role="status">{en ? 'AI is thinking…' : 'AI 正在思考…'}</div>}
        </div>
        {error && <p className="sfai-alert error" role="alert">{error}</p>}
        {notice && <p className="sfai-alert notice" role="status">{notice}</p>}
        <form className="sfai-inputrow" onSubmit={send}>
          <input value={input} onChange={event => setInput(event.target.value)} maxLength={600}
            placeholder={en ? 'Ask anything…' : '输入你的问题…'} aria-label={en ? 'Your message' : '你的问题'}/>
          <button type="submit" disabled={busy || loading || !input.trim()} aria-label={en ? 'Send' : '发送'}><Send size={18}/></button>
        </form>
      </>}
    </section>}
    <button type="button" className="sfai-launcher" onClick={() => setOpen(value => !value)} aria-label={en ? 'Open Starflow AI' : '打开星流 AI'}><Sparkles size={18}/> ✦ Starflow AI</button>
  </>;
}
