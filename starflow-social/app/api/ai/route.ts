import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const reply = (data: object, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store" }
    });

  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return reply({ error: "请求来源无效" }, 403);
    }

    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return reply({ error: "请先登录星流" }, 401);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return reply({ error: "账号服务未配置" }, 503);
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabase.auth.getUser(auth.slice(7));
    if (error || !data.user) {
      return reply({ error: "登录已失效，请重新登录" }, 401);
    }

    const raw = await request.text();
    if (raw.length > 3000) {
      return reply({ error: "消息过长" }, 413);
    }

    let body: { message?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "消息格式错误" }, 400);
    }

    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 600) {
      return reply({ error: "请输入不超过600字的问题" }, 400);
    }

    type AiService = {
      run: (
        model: string,
        input: {
          messages: { role: "system" | "user"; content: string }[];
          max_tokens: number;
        }
      ) => Promise<{ response?: string }>;
    };

    const { env } = getCloudflareContext();
    const ai = (env as unknown as { AI?: AiService }).AI;
    if (!ai) {
      return reply({ error: "AI 模型尚未连接" }, 503);
    }

    const result = await ai.run(
      "@cf/meta/llama-3.1-8b-instruct-fp8",
      {
        messages: [
          {
            role: "system",
            content:
              "你是星流 Starflow 的 AI 官方客服测试版。请用简体中文清晰回答。不得编造平台规则、付款结果、账号状态或认证审批结果。你目前没有实时数据库查询和后台操作能力。遇到不能确认的事项，明确说明并建议联系人工客服。"
          },
          { role: "user", content: message }
        ],
        max_tokens: 500
      }
    );

    return reply({
      reply: result.response || "暂时无法生成回复，请稍后重试。"
    });
  } catch {
    return reply({ error: "AI 服务暂时不可用，请稍后重试" }, 503);
  }
}
