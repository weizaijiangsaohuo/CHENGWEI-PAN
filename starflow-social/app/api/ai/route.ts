
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "system" | "user" | "assistant";
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

type Body = {
  message?: unknown;
  save?: unknown;
  conversationId?: unknown;
};

function getAnswer(result: AiResult): string {
  const raw =
    result.choices?.[0]?.message?.content ??
    result.response ??
    "";

  if (typeof raw !== "string") return "";
  if (raw.includes("<think>") && !raw.includes("</think>")) {
    return "";
  }

  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
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

    const token = auth.slice(7);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return reply({ error: "账号服务未配置" }, 503);
    }

    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: "Bearer " + token
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data.user) {
      return reply({
        error: "登录已失效，请重新登录"
      }, 401);
    }

    const raw = await request.text();

    if (raw.length > 3000) {
      return reply({ error: "消息过长" }, 413);
    }

    let body: Body;

    try {
      body = JSON.parse(raw) as Body;

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        return reply({ error: "消息格式错误" }, 400);
      }
    } catch {
      return reply({ error: "消息格式错误" }, 400);
    }

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message || message.length > 600) {
      return reply({
        error: "请输入不超过600字的问题"
      }, 400);
    }

    const save = body.save === true;
    const conversationId = body.conversationId;

    if (
      save &&
      conversationId != null &&
      (
        typeof conversationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)
      )
    ) {
      return reply({
        error: "对话编号无效"
      }, 400);
    }

    const history: ChatMessage[] = [];

    if (
      save &&
      typeof conversationId === "string"
    ) {
      const { data: owned, error: ownedError } =
        await supabase
          .from("ai_conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("user_id", data.user.id)
          .maybeSingle();

      if (ownedError || !owned) {
        return reply({
          error: "没有找到这段对话"
        }, 404);
      }

      const { data: previous, error: historyError } =
        await supabase
          .from("ai_messages")
          .select("role,content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(12);

      if (historyError) {
        return reply({
          error: "读取聊天记录失败"
        }, 503);
      }

      for (const item of (previous ?? []).reverse()) {
        if (
          (item.role === "user" ||
           item.role === "assistant") &&
          typeof item.content === "string"
        ) {
          history.push({
            role: item.role,
            content: item.content.slice(-1200)
          });
        }
      }
    }

    const { env } = getCloudflareContext();
    const ai =
      (env as unknown as { AI?: AiService }).AI;

    if (!ai) {
      return reply({
        error: "AI 模型尚未连接"
      }, 503);
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是星流 Starflow 的官方 AI 智能助手。",
          "你可以帮助用户日常聊天、学习、写作、创意讨论，并解答星流平台的常见问题。",
          "使用自然、准确的简体中文回答。",
          "简单问题简短回答，复杂问题解释清楚。",
          "结合提供的历史消息理解上下文，但不要假装记得没有提供的内容。",
          "不要编造账号状态、付款记录、认证审批或平台后台数据。",
          "不确定的事情如实说明。",
          "不要声称具备未接入的联网、图片分析和后台操作能力。",
          "/no_think"
        ].join("\n")
      },
      ...history,
      { role: "user", content: message }
    ];

    let answer = "";

    try {
      const result = await ai.run(
        "@cf/qwen/qwen3-30b-a3b-fp8",
        {
          messages,
          max_tokens: 900,
          temperature: 0.7,
          top_p: 0.8
        }
      );

      answer = getAnswer(result);
    } catch {
      // Qwen 不可用时尝试备用模型
    }

    if (!answer) {
      const fallback = await ai.run(
        "@cf/meta/llama-3.1-8b-instruct-fp8",
        {
          messages,
          max_tokens: 700
        }
      );

      answer = getAnswer(fallback);
    }

    if (!answer) {
      return reply({
        error: "AI 暂时没有生成回复，请重试"
      }, 503);
    }

    if (!save) {
      return reply({ reply: answer });
    }

    let id =
      typeof conversationId === "string"
        ? conversationId
        : "";

    if (!id) {
      const { data: created, error: createError } =
        await supabase
          .from("ai_conversations")
          .insert({
            user_id: data.user.id,
            title: message.slice(0, 48)
          })
          .select("id")
          .single();

      if (createError || !created) {
        return reply({
          reply: answer,
          saved: false,
          warning: "本次对话未保存"
        });
      }

      id = created.id;
    }

    const now = Date.now();

    const { error: saveError } =
      await supabase
        .from("ai_messages")
        .insert([
          {
            conversation_id: id,
            role: "user",
            content: message,
            created_at: new Date(now).toISOString()
          },
          {
            conversation_id: id,
            role: "assistant",
            content: answer.slice(0, 20000),
            created_at: new Date(now + 1).toISOString()
          }
        ]);

    if (saveError) {
      return reply({
        reply: answer,
        conversationId: id,
        saved: false,
        warning: "本次对话未保存"
      });
    }

    await supabase
      .from("ai_conversations")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", data.user.id);

    return reply({
      reply: answer,
      conversationId: id,
      saved: true
    });

  } catch {
    return reply({
      error: "AI 服务暂时不可用，请稍后重试"
    }, 503);
  }
}
