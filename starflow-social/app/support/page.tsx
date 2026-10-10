'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Send, CreditCard, UserRound, BadgeCheck, ShieldCheck, Headphones, Ticket, MessageCircle, ChevronRight } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

const topics = [
  { name: '订阅支付', icon: CreditCard, detail: '了解订阅、账单及付款问题' },
  { name: '账号管理', icon: UserRound, detail: '登录、注册及账号设置' },
  { name: '认证帮助', icon: BadgeCheck, detail: '认证规则及申请说明' },
  { name: '隐私与安全', icon: ShieldCheck, detail: '隐私保护与账号安全' },
  { name: '工单进度', icon: Ticket, detail: '工单系统即将开放' },
  { name: '人工客服', icon: Headphones, detail: '人工服务入口筹备中' },
];

export default function SupportPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value || loading) return;
    const next: Message[] = [...messages, { role: 'user', content: value }];
    setMessages(next);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, messages: next.slice(-12) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
      const answer = data.reply ?? data.response;
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI 暂时没有返回内容');
      setMessages(current => [...current, { role: 'assistant', content: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂时无法连接 AI 服务');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="support-root">
      <div className="support-shell">
        <header className="support-header">
          <Link href="/" className="support-back" aria-label="返回星流首页"><ArrowLeft size={21} /></Link>
          <div className="support-brand"><div className="support-logo">✦</div><div><strong>星流客服服务中心</strong><small>专业 · 温柔 · 智能</small></div></div>
        </header>

        <section className="support-hero">
          <div className="support-ai-title"><Sparkles size={20} /> <strong>✦ Starflow AI</strong></div>
          <h1>你好，欢迎来到星流 ✨</h1>
          <p>我是你的专属智能助手。此刻，你想聊些什么？</p>
          <span>Understand more. Help better.</span>
        </section>

        <section className="support-topics" aria-label="帮助中心">
          <h2>我们可以帮你解决</h2>
          <div className="support-grid">
            {topics.map(topic => {
              const Icon = topic.icon;
              return <button key={topic.name} type="button" onClick={() => {
                if (topic.name === '工单进度' || topic.name === '人工客服') {
                  setError(topic.detail);
                } else {
                  setInput('我想了解星流的' + topic.name + '，请介绍相关帮助信息。');
                  document.getElementById('support-input')?.focus();
                }
              }}>
                <Icon size={23} strokeWidth={1.8} />
                <strong>{topic.name}</strong>
                <small>{topic.detail}</small>
                <ChevronRight className="support-chevron" size={16} />
              </button>;
            })}
          </div>
        </section>

        <section className="support-chat" aria-label="Starflow AI 对话">
          <div className="support-chat-heading"><MessageCircle size={20} /><strong>与 Starflow AI 对话</strong></div>
          <div className="support-messages" aria-live="polite">
            <div className="support-bubble assistant">你好！我是 ✦ Starflow AI，你的专属智能助手。请告诉我你需要什么帮助。</div>
            {messages.map((message, index) => <div key={index} className={'support-bubble ' + message.role}>{message.content}</div>)}
            {loading && <div className="support-bubble assistant">正在思考…</div>}
          </div>
          {error && <p className="support-error" role="status">{error}</p>}
          <form className="support-form" onSubmit={send}>
            <input id="support-input" value={input} onChange={event => setInput(event.target.value)} placeholder="向 Starflow AI 提问…" maxLength={600} aria-label="输入问题" />
            <button type="submit" disabled={loading || !input.trim()} aria-label="发送消息"><Send size={20} /></button>
          </form>
          <p className="support-note">AI 回复仅供参考。涉及账号、支付或认证的操作请以星流官方实际功能为准。</p>
        </section>
        <footer>© Starflow · 星流官方智能服务</footer>
      </div>
      <style jsx>{`
        .support-root{min-height:100vh;background:radial-gradient(ellipse at 15% 0%,#ffe0f0 0%,transparent 45%),radial-gradient(ellipse at 100% 35%,#e7dcff 0%,transparent 48%),#fff8fc;color:#56364e;padding:20px 14px 70px;font-family:inherit}
        .support-shell{max-width:820px;margin:auto}
        .support-header{display:flex;align-items:center;gap:14px;margin-bottom:24px}
        .support-back{width:42px;height:42px;display:grid;place-items:center;border:1px solid #f0d9e8;border-radius:15px;background:#ffffffbf;color:#87496e;text-decoration:none}
        .support-brand{display:flex;align-items:center;gap:11px}.support-brand strong{display:block;font-size:18px}.support-brand small{display:block;color:#ae7b9b;font-size:12px;margin-top:4px}
        .support-logo{width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,#ff94bf,#b99bff);display:grid;place-items:center;color:white;font-size:30px;box-shadow:0 8px 20px #e8a5cc55}
        .support-hero,.support-topics,.support-chat{background:#ffffffb9;border:1px solid #f3d9e9;border-radius:25px;box-shadow:0 12px 35px #d88ab015;backdrop-filter:blur(18px);padding:22px;margin-bottom:18px}
        .support-hero{background:linear-gradient(130deg,#ffe3f0df,#f4eaffdf)}
        .support-ai-title{display:flex;align-items:center;gap:8px;color:#c74d92}.support-hero h1{font-size:23px;margin:18px 0 8px}.support-hero p{line-height:1.8;margin:0 0 14px;font-size:14px}.support-hero span{font-size:12px;color:#aa7b9c}
        .support-topics h2{font-size:17px;margin:0 0 17px}.support-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
        .support-grid button{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;text-align:left;min-height:117px;padding:16px 13px;border-radius:17px;border:1px solid #f2dce9;background:#fffafd;color:#704662;cursor:pointer}
        .support-grid button svg{color:#d96aab}.support-grid button strong{font-size:14px}.support-grid button small{font-size:11px;color:#ac879e;line-height:1.5}.support-chevron{position:absolute;right:9px;top:14px}
        .support-chat-heading{display:flex;align-items:center;gap:9px;color:#b54b88;margin-bottom:16px}
        .support-messages{display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-height:160px;max-height:390px;overflow-y:auto;padding:5px 1px 15px}
        .support-bubble{white-space:pre-wrap;overflow-wrap:anywhere;padding:13px 15px;border-radius:16px;max-width:90%;font-size:14px;line-height:1.7}
        .support-bubble.assistant{background:#fff2f8;border:1px solid #f6dce9}.support-bubble.user{align-self:flex-end;background:linear-gradient(120deg,#f7b4d8,#ddc5ff);color:#57324c}
        .support-form{display:flex;gap:9px;align-items:center;background:#fff;border:1px solid #efcee2;border-radius:22px;padding:8px}
        .support-form input{flex:1;min-width:0;border:0;outline:none;background:transparent;padding:9px;color:#58334e;font-size:14px}
        .support-form button{width:42px;height:42px;border:0;border-radius:15px;background:linear-gradient(135deg,#ed83b5,#b49afa);color:white;display:grid;place-items:center;cursor:pointer}
        .support-form button:disabled{opacity:.45;cursor:not-allowed}.support-error{color:#b34770;font-size:13px}.support-note{font-size:11px;color:#a18196;line-height:1.7;margin:13px 0 0}
        footer{text-align:center;color:#bb91aa;font-size:12px;padding:14px}
        @media(min-width:700px){.support-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.support-root{padding-top:35px}}
      `}</style>
    </main>
  );
}
