
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type AiOutput = {
  response?: string;
  choices?: Array<{
    message?: { content?: string };
  }>;
};

type AiService = {
  run: (
    model: string,
    input: {
      messages: ChatMessage[];
      max_tokens: number;
      temperature?: number;
    }
  ) => Promise<AiOutput>;
};

type RateLimiter = {
  limit: (
    args: { key: string }
  ) => Promise<{ success: boolean }>;
};

type Bindings = {
  AI?: AiService;
  SUPPORT_PER_IP?: RateLimiter;
  SUPPORT_GLOBAL?: RateLimiter;
};

function reply(data: object, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function getAnswer(result: AiOutput): string {
  const content =
    result.choices?.[0]?.message?.content ??
    result.response ??
    '';

  if (typeof content !== 'string') return '';

  if (
    content.includes('<think>') &&
    !content.includes('</think>')
  ) return '';

  return content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
}

export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;

    if (request.headers.get('origin') !== origin) {
      return reply({ error: '请求来源无效' }, 403);
    }

    const contentType =
      request.headers.get('content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('application/json')) {
      return reply({ error: '请求格式不正确' }, 415);
    }

    const length = Number(
      request.headers.get('content-length') ?? 0
    );

    if (!Number.isFinite(length) || length > 3500) {
      return reply({ error: '消息过长' }, 413);
    }

    const raw = await request.text();

    if (raw.length > 3500) {
      return reply({ error: '消息过长' }, 413);
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return reply({ error: '消息格式错误' }, 400);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return reply({ error: '消息格式错误' }, 400);
    }

    const body = parsed as {
      message?: unknown;
      messages?: unknown;
    };

    if (typeof body.message !== 'string') {
      return reply({ error: '请输入问题' }, 400);
    }

    const question = body.message.trim();

    if (!question || question.length > 400) {
      return reply({
        error: '请输入不超过400字的问题'
      }, 400);
    }

    const history: ChatMessage[] = [];

    if (body.messages != null) {
      if (
        !Array.isArray(body.messages) ||
        body.messages.length > 6
      ) {
        return reply({ error: '聊天记录格式错误' }, 400);
      }

      for (const item of body.messages) {
        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          (item.role !== 'user' &&
           item.role !== 'assistant') ||
          typeof item.content !== 'string' ||
          item.content.length > 500
        ) {
          return reply({
            error: '聊天记录格式错误'
          }, 400);
        }

        history.push({
          role: item.role,
          content: item.content
        });
      }
    }

    const { env } = getCloudflareContext();
    const bindings = env as unknown as Bindings;

    if (
      !bindings.AI ||
      !bindings.SUPPORT_PER_IP ||
      !bindings.SUPPORT_GLOBAL
    ) {
      return reply({
        error: 'AI 客服尚未完成配置'
      }, 503);
    }

    const ip =
      request.headers.get('cf-connecting-ip') ??
      'unknown';

    const [visitor, global] = await Promise.all([
      bindings.SUPPORT_PER_IP.limit({
        key: 'support:' + ip
      }),
      bindings.SUPPORT_GLOBAL.limit({
        key: 'support:global'
      })
    ]);

    if (!visitor.success || !global.success) {
      return reply({
        error: '提问太频繁，请一分钟后重试'
      }, 429);
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          '你是 Starflow 星流官方 AI 客服。',
          '你不是人工客服。',
          '任何访客都可以使用客服，无需登录。',
          '帮助用户了解账号、登录、注册、',
          '发布动态、评论、关注、隐私和安全。',
          '用户之间的私信功能已取消。',
          '不要编造账号、订单或支付信息。',
          '不要索取密码、验证码和银行卡信息。',
          '回答应当准确、简洁、清楚。',
          '使用简体中文。',
          '/no_think'
        ].join('\n')
      },
      ...history,
      {
        role: 'user',
        content: question
      }
    ];

    let answer = '';

    try {
      const result = await bindings.AI.run(
        '@cf/meta/llama-3.1-8b-instruct-fp8',
        {
          messages,
          max_tokens: 450,
          temperature: 0.4
        }
      );

      answer = getAnswer(result);
    } catch {
      // 尝试备用模型
    }

    if (!answer) {
      try {
        const result = await bindings.AI.run(
          '@cf/qwen/qwen3-30b-a3b-fp8',
          {
            messages,
            max_tokens: 500,
            temperature: 0.4
          }
        );

        answer = getAnswer(result);
      } catch {
        // AI 暂时不可用
      }
    }

    if (!answer) {
      return reply({
        error: 'AI 客服暂时无法回复，请稍后再试'
      }, 503);
    }

    return reply({
      reply: answer.slice(0, 2500)
    });
  } catch {
    return reply({
      error: 'AI 客服暂时不可用，请稍后再试'
    }, 503);
  }
}
