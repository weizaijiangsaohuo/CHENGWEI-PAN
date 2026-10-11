'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, hasConfig } from '@/lib/supabase';

type MentionUser = { id: string; handle: string; display_name: string; avatar_url: string | null };
type MentionToken = { query: string; start: number; end: number };

/** Only usernames actually present in the current text before the caret are autocompleted. */
function findMention(input: HTMLTextAreaElement): MentionToken | null {
  const end = input.selectionStart;
  if (end == null) return null;
  const prior = input.value.slice(0, end);
  const result = /(^|[^\p{L}\p{N}_@])@([a-z0-9_]{0,24})$/iu.exec(prior);
  return result ? { query: result[2].toLowerCase(), start: end - result[2].length - 1, end } : null;
}

/** Link only real @handle-shaped tokens, never email addresses or parts of longer words. */
function linkifyMentions() {
  const roots = document.querySelectorAll<HTMLElement>('.app-frame .post-content');
  roots.forEach(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!(node instanceof Text)) continue;
      if (node.parentElement?.closest('a,button,code,pre,textarea')) continue;
      if (/(^|[^\p{L}\p{N}_@])@[a-z0-9_]{3,24}(?![a-z0-9_])/iu.test(node.data)) nodes.push(node);
    }
    const expression = /(^|[^\p{L}\p{N}_@])@([a-z0-9_]{3,24})(?![a-z0-9_])/giu;
    for (const textNode of nodes) {
      const text = textNode.data;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      expression.lastIndex = 0;
      for (const match of text.matchAll(expression)) {
        const matchIndex = match.index;
        const prefix = match[1];
        const mentionStart = matchIndex + prefix.length;
        if (mentionStart > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, mentionStart)));
        const a = document.createElement('a');
        a.className = 'sf-mention-link';
        a.setAttribute('href', '/profile/' + encodeURIComponent(match[2].toLowerCase()));
        a.textContent = '@' + match[2];
        a.setAttribute('title', '查看 @' + match[2] + ' 的个人主页');
        fragment.appendChild(a);
        cursor = mentionStart + match[2].length + 1;
      }
      if (cursor === 0) continue;
      if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.replaceWith(fragment);
    }
  });
}

/** Adds a small mention picker to the existing tested post/reply composer.
 * Neither the editor's controlled React state nor the posting and notification logic is replaced. */
export function StarflowMentions() {
  const activeInput = useRef<HTMLTextAreaElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [token, setToken] = useState<MentionToken | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const tokenRef = useRef<MentionToken | null>(null);
  const usersRef = useRef<MentionUser[]>([]);
  const selectRef = useRef<(user: MentionUser) => void>(() => {});
  tokenRef.current = token;
  usersRef.current = users;

  const readInput = useCallback((input: HTMLTextAreaElement) => {
    if (!input.matches('.app-frame .composer textarea')) return;
    activeInput.current = input;
    let mount = input.parentElement?.querySelector<HTMLElement>(':scope > .sf-mention-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'sf-mention-mount';
      input.insertAdjacentElement('afterend', mount);
    }
    setSlot(previous => previous === mount ? previous : mount);
    const next = findMention(input);
    setToken(previous => previous?.query === next?.query && previous?.start === next?.start && previous?.end === next?.end ? previous : next);
    setSelected(0);
  }, []);

  const choose = useCallback((user: MentionUser) => {
    const input = activeInput.current;
    if (!input || !input.isConnected) return;
    const current = findMention(input);
    if (!current) return;
    const nextText = input.value.slice(0, current.start) + '@' + user.handle + ' ' + input.value.slice(current.end);
    const cursor = current.start + user.handle.length + 2;
    // Use the native setter so React's controlled textarea receives a genuine input event.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) return;
    setter.call(input, nextText);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: '@' + user.handle + ' ' }));
    input.focus();
    input.setSelectionRange(cursor, cursor);
    setToken(null);
  }, []);
  selectRef.current = choose;

  useEffect(() => {
    function update(event: Event) {
      const input = event.target;
      if (input instanceof HTMLTextAreaElement) readInput(input);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.isComposing || !tokenRef.current || event.target !== activeInput.current) return;
      const items = usersRef.current;
      if (event.key === 'Escape') { event.preventDefault(); setToken(null); return; }
      if (!items.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(i => (i + 1) % items.length); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(i => (i + items.length - 1) % items.length); }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const index = document.querySelector<HTMLElement>('.sf-mention-menu [aria-selected="true"]')?.dataset.index;
        selectRef.current(items[index == null ? 0 : Number(index)] ?? items[0]);
      }
    }
    function outside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.sf-mention-menu') && target !== activeInput.current) setToken(null);
    }
    document.addEventListener('input', update, true);
    document.addEventListener('click', update, true);
    document.addEventListener('keyup', update, true);
    document.addEventListener('focusin', update, true);
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('input', update, true);
      document.removeEventListener('click', update, true);
      document.removeEventListener('keyup', update, true);
      document.removeEventListener('focusin', update, true);
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [readInput]);

  useEffect(() => {
    if (!token || !slot?.isConnected || !hasConfig()) { setUsers([]); setLoading(false); return; }
    let valid = true;
    setLoading(true);
    const task = window.setTimeout(async () => {
      try {
        const q = token.query;
        let request = db().from('profiles').select('id,handle,display_name,avatar_url').limit(8);
        request = q ? request.or(`handle.ilike.${q}%,display_name.ilike.%${q}%`) : request.order('created_at', { ascending: false });
        const { data, error } = await request;
        if (error) throw error;
        if (!valid) return;
        const ranked = ((data ?? []) as MentionUser[]).sort((a, b) => {
          const rank = (u: MentionUser) => u.handle.toLowerCase() === q ? 0 : u.handle.toLowerCase().startsWith(q) ? 1 : 2;
          return rank(a) - rank(b);
        });
        setUsers(ranked);
      } catch { if (valid) setUsers([]); }
      finally { if (valid) setLoading(false); }
    }, token.query ? 150 : 60);
    return () => { valid = false; window.clearTimeout(task); };
  }, [token?.query, token?.start, slot]);

  useEffect(() => {
    let animation = 0;
    const refresh = () => { animation = 0; linkifyMentions(); };
    const schedule = () => { if (!animation) animation = window.requestAnimationFrame(refresh); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (animation) window.cancelAnimationFrame(animation); };
  }, []);

  return token && slot?.isConnected ? createPortal(
    <div className="sf-mention-menu" id="sf-mention-users" role="listbox" aria-label="选择提及账号">
      <div className="sf-mention-heading">提及账号 <span>输入用户名搜索</span></div>
      {loading ? <div className="sf-mention-empty" role="status">正在查找账号…</div>
        : users.length ? users.map((u, i) => <button type="button" role="option" aria-selected={i === selected} data-index={i} key={u.id}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(u)}>
            <span className="sf-mention-avatar">{u.avatar_url ? <img src={u.avatar_url} alt="" /> : u.display_name.slice(0,1).toUpperCase()}</span>
            <span className="sf-mention-person"><strong>{u.display_name}</strong><small>@{u.handle}</small></span>
          </button>)
        : <div className="sf-mention-empty">没有匹配的账号</div>}
    </div>, slot
  ) : null;
}
