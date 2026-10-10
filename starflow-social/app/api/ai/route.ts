import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type AiResult = {
  response?: string;
  choices?: Array<{ message?: { content?: string } }>;
};

type AiService = {
  run: (
    model: string,
    input: {
      messages: ChatMessage[];
      max_tokens: number;
      temperature?: number;
      top_p?: number;
    }
  ) => Promise<AiResult>;
};

function getAnswer(result: AiResult): string {
  const raw = result.choices?.[0]?.message?.content ?? result.response ?? "";
  if (typeof raw !== "string") return "";
  if (raw.includes("<think>") && !raw.includes("</think>")) return "";
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

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

    const { env } = getCloudflareContext();
    const ai = (env as unknown as { AI?: AiService }).AI;
    if (!ai) {
      return reply({ error: "AI 模型尚未连接" }, 503);
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是星流 Starflow 的官方 AI 智能助手，既能解答星流平台问题，也能进行日常聊天、学习辅导、写作和创意讨论。",
          "优先直接回答用户真正的问题，不要每次都重复身份或让用户去找客服。",
          "使用自然、清楚、有亲和力的简体中文；简单问题简短回答，复杂问题分步骤解释；避免机械套话和无意义的客套。",
          "用户要求写文案、改文字或举例时，直接给出可用的内容。",
          "对于星流的具体账号状态、付款、认证、政策、人工审批、平台数据，不要编造或声称查到了后台信息；没有实时查询和后台操作能力时如实说明。",
          "不知道的事情明确说不确定；医疗、法律和财务等重要问题提醒用户核实专业信息。",
          "不要自称是 ChatGPT 或 OpenAI 官方助手，也不要声称具备未接入的联网、图片分析或历史记录功能。",
          "/no_think"
        ].join("\n")
      },
      { role: "user", content: message }
    ];

    let answer = "";
    try {
      const result = await ai.run("@cf/qwen/qwen3-30b-a3b-fp8", {
        messages,
        max_tokens: 900,
        temperature: 0.7,
        top_p: 0.8
      });
      answer = getAnswer(result);
    } catch {
      // If Qwen is unavailable, use the original model.
    }

    if (!answer) {
      const fallback = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages,
        max_tokens: 700
      });
      answer = getAnswer(fallback);
    }

    return reply({
      reply: answer || "暂时无法生成回复，请稍后重试。"
    });
  } catch {
    return reply({ error: "AI 服务暂时不可用，请稍后重试" }, 503);
  }
}
