
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Role = 'system' | 'user' | 'assistant';
type ChatMessage = { role: Role; content: string };
type AiResult = { response?: string; choices?: Array<{ message?: { content?: string } }> };
type AiService = {
  run: (model: string, input: {
    messages: ChatMessage[];
    max_tokens: number;
    temperature?: number;
    top_p?: number;
  }) => Promise<AiResult>;
};
type PostBody = { message?: unknown; save?: unknown; conversationId?: unknown };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const json = (data: object, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

async function currentUser(request: Request): Promise<
  | { ok: true; client: SupabaseClient; userId: string }
  | { ok: false; response: Response }
> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return { ok: false, response: json({ error: '请求来源无效' }, 403) };
  }
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, response: json({ error: '请先登录星流' }, 401) };
  }
  const token = authorization.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, response: json({ error: '账号服务未配置' }, 503) };
  }
  // Forward the USER token to every PostgREST call; NEVER use service_role.
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: json({ error: '登录已失效，请重新登录' }, 401) };
  }
  return { ok: true, client, userId: data.user.id };
}

function shanghaiTime(date = new Date()) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23'
  };
  const parts = new Intl.DateTimeFormat('zh-CN', options).formatToParts(date);
  const part = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === kind)?.value ?? '';
  return `${part('year')}年${part('month')}月${part('day')}日${part('weekday')}，北京时间${part('hour')}:${part('minute')}`;
}

function exactClockAnswer(input: string, now: string): string | null {
  const s = input.replace(/[\s？?！!。,.，]/g, '');
  if (s.length > 55) return null;
  if (/^(?:(?:中国|北京时间|现在|今天|此刻|请问|告诉我)的?)*(?:今天)?(?:是)?星期几(?:了)?$/.test(s) ||
      /^(?:中国)?今天(?:是)?(?:星期几|周几)$/.test(s)) {
    return `今天（中国北京时间）是${now.split('日')[0]}日，${now.match(/星期[一二三四五六日]/)?.[0] ?? ''}。`;
  }
  if (/^(?:中国|北京时间|今天|现在|此刻|请问|告诉我|的|是)*(?:现在)?(?:几月几号|几月几日|日期|今天几号)$/.test(s)) {
    return `今天（中国北京时间）是${now.split('，')[0]}。`;
  }
  if (/^(?:中国|北京时间|现在|此刻|请问|告诉我|的|是)*(?:现在)?(?:几点|几点了|几点几分|时间)$/.test(s)) {
    return `现在${now}。`;
  }
  return null;
}

function getAnswer(result: AiResult): string {
  const raw = result.choices?.[0]?.message?.content ?? result.response ?? '';
  if (typeof raw !== 'string') return '';
  if (raw.includes('<think>') && !raw.includes('</think>')) return '';
  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function ownsConversation(client: SupabaseClient, userId: string, conversationId: string) {
  const { data, error } = await client.from('ai_conversations').select('id')
    .eq('id', conversationId).eq('user_id', userId).maybeSingle();
  return { owned: !!data && !error, error };
}

// GET /api/ai  -> recent conversations
// GET /api/ai?conversationId=uuid -> full conversation history (bounded)
export async function GET(request: Request) {
  try {
    const session = await currentUser(request);
    if (!session.ok) return session.response;
    const { client, userId } = session;
    const conversationId = new URL(request.url).searchParams.get('conversationId');
    if (conversationId !== null) {
      if (!UUID.test(conversationId)) return json({ error: '对话编号无效' }, 400);
      const owned = await ownsConversation(client, userId, conversationId);
      if (!owned.owned) return json({ error: owned.error ? '读取对话失败，请检查数据库权限' : '没有找到这段对话' }, owned.error ? 503 : 404);
      const { data, error } = await client.from('ai_messages').select('id,role,content,created_at')
        .eq('conversation_id', conversationId).order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(200);
      if (error) return json({ error: '读取聊天记录失败，请检查数据库权限' }, 503);
      return json({ conversationId, messages: (data ?? []).reverse() });
    }
    const { data, error } = await client.from('ai_conversations')
      .select('id,title,updated_at,created_at').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(50);
    if (error) return json({ error: '读取会话列表失败，请检查数据库权限' }, 503);
    return json({ conversations: data ?? [] });
  } catch {
    return json({ error: '读取 AI 聊天记录失败，请稍后重试' }, 503);
  }
}

// DELETE /api/ai?conversationId=uuid, also removes messages through FK cascade.
export async function DELETE(request: Request) {
  try {
    const session = await currentUser(request);
    if (!session.ok) return session.response;
    const id = new URL(request.url).searchParams.get('conversationId') ?? '';
    if (!UUID.test(id)) return json({ error: '对话编号无效' }, 400);
    const { data, error } = await session.client.from('ai_conversations')
      .delete().eq('id', id).eq('user_id', session.userId).select('id');
    if (error) return json({ error: '删除对话失败，请检查数据库权限' }, 503);
    if (!data?.length) return json({ error: '没有找到这段对话' }, 404);
    return json({ deleted: true, conversationId: id });
  } catch {
    return json({ error: '删除失败，请稍后重试' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const session = await currentUser(request);
    if (!session.ok) return session.response;
    const { client, userId } = session;
    const raw = await request.text();
    if (raw.length > 4000) return json({ error: '消息过长' }, 413);
    let body: PostBody;
    try {
      body = JSON.parse(raw) as PostBody;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    } catch {
      return json({ error: '消息格式错误' }, 400);
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 600) return json({ error: '请输入不超过600字的问题' }, 400);
    const save = body.save !== false; // Saving is the default.
    const conversationId = body.conversationId;
    if (conversationId != null && (typeof conversationId !== 'string' || !UUID.test(conversationId))) {
      return json({ error: '对话编号无效' }, 400);
    }
    if (save && typeof conversationId === 'string') {
      const owned = await ownsConversation(client, userId, conversationId);
      if (!owned.owned) return json({ error: owned.error ? '读取对话失败，请检查数据库权限' : '没有找到这段对话' }, owned.error ? 503 : 404);
    }

    // Quota is atomic on the DB, not a client-side timeout that can be bypassed.
    const quota = await client.rpc('claim_ai_request');
    if (quota.error) return json({ error: 'AI 限流服务尚未配置，请先执行 004_ai_chat.sql' }, 503);
    if (quota.data !== true) return json({ error: '发送太频繁，请在一分钟后重试' }, 429);

    const history: ChatMessage[] = [];
    if (save && typeof conversationId === 'string') {
      const { data, error } = await client.from('ai_messages').select('role,content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(12);
      if (error) return json({ error: '读取聊天历史失败，请检查数据库权限' }, 503);
      for (const item of (data ?? []).reverse()) {
        if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') {
          history.push({ role: item.role, content: item.content.slice(-1200) });
        }
      }
    }
    const now = shanghaiTime();
    let answer = exactClockAnswer(message, now) ?? '';
    if (!answer) {
      const { env } = getCloudflareContext();
      const ai = (env as unknown as { AI?: AiService }).AI;
      if (!ai) return json({ error: 'AI 模型尚未连接' }, 503);
      const messages: ChatMessage[] = [
        { role: 'system', content: [
          '你是星流 Starflow 的官方 AI 智能助手。你可以进行日常聊天、学习、写作与平台常见问题解答。',
          `服务器提供的当前中国北京时间是：${now}。回答日期、星期、时间问题时以此为准，不要猜测。`,
          '用自然、准确的简体中文回答，简单问题简短回答，复杂问题说明步骤。',
          '参考已有聊天历史理解上下文，但不要声称记得未提供的内容。',
          '不要编造账号状态、支付记录、平台后台数据，不要声称有未接入的联网或后台操作能力。',
          '/no_think'
        ].join('\n') },
        ...history,
        { role: 'user', content: message }
      ];
      try {
        const result = await ai.run('@cf/qwen/qwen3-30b-a3b-fp8', {
          messages, max_tokens: 900, temperature: 0.7, top_p: 0.8
        });
        answer = getAnswer(result);
      } catch { /* Try fallback model. */ }
      if (!answer) {
        try {
          const result = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
            messages, max_tokens: 700
          });
          answer = getAnswer(result);
        } catch { /* Both models unavailable. */ }
      }
    }
    if (!answer) return json({ error: 'AI 暂时没有生成回复，请稍后再试' }, 503);
    if (!save) return json({ reply: answer, saved: false });

    let id = typeof conversationId === 'string' ? conversationId : '';
    let newlyCreated = false;
    if (!id) {
      const { data, error } = await client.from('ai_conversations')
        .insert({ user_id: userId, title: message.slice(0, 48) })
        .select('id').single();
      if (error || !data) return json({ reply: answer, saved: false, warning: '回复已生成，但数据库未保存本次对话' });
      id = data.id;
      newlyCreated = true;
    }
    const stamp = Date.now();
    const saved = await client.from('ai_messages').insert([
      { conversation_id: id, role: 'user', content: message, created_at: new Date(stamp).toISOString() },
      { conversation_id: id, role: 'assistant', content: answer.slice(0, 20000), created_at: new Date(stamp + 1).toISOString() }
    ]);
    if (saved.error) {
      if (newlyCreated) await client.from('ai_conversations').delete().eq('id', id).eq('user_id', userId);
      return json({ reply: answer, saved: false, warning: '回复已生成，但数据库未保存本次对话' });
    }
    const updated = await client.from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId);
    return json({ reply: answer, saved: true, conversationId: id,
      ...(updated.error ? { warning: '对话已保存，但列表更新时间失败' } : {}) });
  } catch {
    return json({ error: 'AI 服务暂时不可用，请稍后重试' }, 503);
  }
}
