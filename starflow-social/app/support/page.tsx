
'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { siteText, topicQuestion, type SiteKey } from '@/lib/site-copy';
import {
  ArrowLeft,
  Sparkles,
  Send,
  CreditCard,
  UserRound,
  BadgeCheck,
  ShieldCheck,
  MessageCircle,
  ChevronRight
} from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const topics: {key:SiteKey;detail:SiteKey;icon:typeof UserRound}[] = [
  {key:'account',detail:'accountDetail',icon:UserRound},
  {key:'posting',detail:'postingDetail',icon:MessageCircle},
  {key:'privacy',detail:'privacyDetail',icon:ShieldCheck},
  {key:'verification',detail:'verificationDetail',icon:BadgeCheck},
  {key:'billing',detail:'billingDetail',icon:CreditCard}
];

export default function SupportPage() {
  const {lang} = useLanguage();
  const copy = (key:SiteKey) => siteText(lang,key);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();

    if (!question || loading || question.length > 400) {
      return;
    }

    const history = messages.slice(-6);

    setMessages(current => [
      ...current,
      { role: 'user', content: question }
    ]);

    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: question,
          messages: history,
          locale: lang
        }),
        cache: 'no-store'
      });

      const result: unknown = await response.json();

      const data = result as {
        reply?: unknown;
        error?: unknown;
      };

      if (
        !response.ok ||
        typeof data.reply !== 'string' ||
        !data.reply.trim()
      ) {
        throw new Error(
          typeof data.error === 'string' && (lang === 'zh' || lang === 'zh-hk')
            ? data.error
            : copy('noReply')
        );
      }

      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: (data.reply as string).trim()
        }
      ]);

      window.setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 20);

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : copy('connectError')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="support-root">
      <div className="support-shell">

        <header className="support-header">
          <Link
            href="/"
            className="support-back"
            aria-label={copy("back")}
          >
            <ArrowLeft size={21} />
          </Link>

          <div className="support-brand">
            <div className="support-logo">✦</div>

            <div>
              <strong>Starflow AI 客服中心</strong>
              <small>{copy('brandDetail')}</small>
            </div>
          </div>
        </header>

        <section className="support-hero">
          <div className="support-ai-title">
            <Sparkles size={20} />
            <strong>✦ Starflow AI</strong>
          </div>

          <h1>{copy('welcome')}</h1>

          <p>{copy('intro')}</p>

          <span>{copy('disclaimer')}</span>
        </section>

        <section
          className="support-topics"
          aria-label={copy("topics")}
        >
          <h2>{copy('topics')}</h2>

          <div className="support-grid">
            {topics.map(topic => {
              const Icon = topic.icon;

              return (
                <button
                  key={topic.key}
                  type="button"
                  onClick={() => {
                    setInput(topicQuestion(lang, copy(topic.key)));

                    setError('');
                    inputRef.current?.focus();
                  }}
                >
                  <Icon size={23} strokeWidth={1.8} />

                  <strong>{copy(topic.key)}</strong>

                  <small>{copy(topic.detail)}</small>

                  <ChevronRight
                    className="support-chevron"
                    size={16}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="support-chat"
          aria-label={copy("chatTitle")}
        >
          <div className="support-chat-heading">
            <MessageCircle size={20} />
            <strong>{copy('chatTitle')}</strong>
          </div>

          <div
            className="support-messages"
            aria-live="polite"
            ref={scrollRef}
          >
            <div className="support-bubble assistant">
              {copy('greeting')}
            </div>

            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  'support-bubble ' + message.role
                }
              >
                {message.content}
              </div>
            ))}

            {loading && (
              <div className="support-bubble assistant">
                {copy('thinking')}
              </div>
            )}
          </div>

          {error && (
            <p className="support-error" role="alert">
              {error}
            </p>
          )}

          <form
            className="support-form"
            onSubmit={send}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={event => {
                setInput(event.target.value);
              }}
              placeholder={copy("placeholder")}
              maxLength={400}
              aria-label={copy("questionLabel")}
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label={copy("send")}
            >
              <Send size={20} />
            </button>
          </form>

          <p className="support-note">{copy('note')}</p>
        </section>

        <footer>
          {copy('footer')}
        </footer>
      </div>

      <style jsx>{`
        .support-root {
          min-height: 100vh;
          padding: 20px 14px 70px;
          color: #56364e;
          background:
            radial-gradient(
              ellipse at 15% 0%,
              #ffe0f0 0%,
              transparent 45%
            ),
            radial-gradient(
              ellipse at 100% 35%,
              #e7dcff 0%,
              transparent 48%
            ),
            #fff8fc;
        }

        .support-shell {
          max-width: 820px;
          margin: auto;
        }

        .support-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }

        .support-back {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 1px solid #f0d9e8;
          border-radius: 15px;
          background: #ffffffbf;
          color: #87496e;
          text-decoration: none;
        }

        .support-brand {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .support-brand strong {
          display: block;
          font-size: 18px;
        }

        .support-brand small {
          display: block;
          color: #ae7b9b;
          font-size: 12px;
          margin-top: 4px;
        }

        .support-logo {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          color: white;
          font-size: 30px;
          background:
            linear-gradient(
              135deg,
              #ff94bf,
              #b99bff
            );
        }

        .support-hero,
        .support-topics,
        .support-chat {
          padding: 22px;
          margin-bottom: 18px;
          border: 1px solid #f3d9e9;
          border-radius: 25px;
          background: #ffffffb9;
          box-shadow: 0 12px 35px #d88ab015;
          backdrop-filter: blur(18px);
        }

        .support-hero {
          background:
            linear-gradient(
              130deg,
              #ffe3f0df,
              #f4eaffdf
            );
        }

        .support-ai-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #c74d92;
        }

        .support-hero h1 {
          margin: 18px 0 8px;
          font-size: 23px;
        }

        .support-hero p {
          margin: 0 0 14px;
          font-size: 14px;
          line-height: 1.8;
        }

        .support-hero span {
          color: #aa7b9c;
          font-size: 12px;
        }

        .support-topics h2 {
          margin: 0 0 17px;
          font-size: 17px;
        }

        .support-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 11px;
        }

        .support-grid button {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          min-height: 117px;
          padding: 16px 13px;
          border: 1px solid #f2dce9;
          border-radius: 17px;
          background: #fffafd;
          color: #704662;
          text-align: left;
          cursor: pointer;
        }

        .support-grid button svg {
          color: #d96aab;
        }

        .support-grid button strong {
          font-size: 14px;
        }

        .support-grid button small {
          color: #ac879e;
          font-size: 11px;
          line-height: 1.5;
        }

        .support-chevron {
          position: absolute;
          top: 14px;
          right: 9px;
        }

        .support-chat-heading {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 16px;
          color: #b54b88;
        }

        .support-messages {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          min-height: 160px;
          max-height: 390px;
          padding: 5px 1px 15px;
          overflow-y: auto;
        }

        .support-bubble {
          max-width: 90%;
          padding: 13px 15px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .support-bubble.assistant {
          border: 1px solid #f6dce9;
          background: #fff2f8;
        }

        .support-bubble.user {
          align-self: flex-end;
          background:
            linear-gradient(
              120deg,
              #f7b4d8,
              #ddc5ff
            );
          color: #57324c;
        }

        .support-form {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px;
          border: 1px solid #efcee2;
          border-radius: 22px;
          background: #fff;
        }

        .support-form input {
          flex: 1;
          min-width: 0;
          padding: 9px;
          border: 0;
          outline: none;
          background: transparent;
          color: #58334e;
          font-size: 14px;
        }

        .support-form button {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border: 0;
          border-radius: 15px;
          background:
            linear-gradient(
              135deg,
              #ed83b5,
              #b49afa
            );
          color: white;
          cursor: pointer;
        }

        .support-form button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .support-error {
          color: #b34770;
          font-size: 13px;
        }

        .support-note {
          margin: 13px 0 0;
          color: #a18196;
          font-size: 11px;
          line-height: 1.7;
        }

        footer {
          padding: 14px;
          color: #bb91aa;
          font-size: 12px;
          text-align: center;
        }

        @media (min-width: 700px) {
          .support-grid {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }

          .support-root {
            padding-top: 35px;
          }
        }
      `}</style>
    </main>
  );
}
