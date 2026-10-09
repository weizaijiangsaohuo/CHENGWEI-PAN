// Supabase Edge Function: welcome-email
// Invoke after Google OAuth success or email verification + first login.
// Configure function with JWT verification disabled at gateway, because this
// handler authenticates the actual USER JWT with auth.getUser(token).
// Never paste RESEND_API_KEY or service-role keys into website code.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] ?? c);
}
function env(name: string): string { return Deno.env.get(name)?.trim() ?? ''; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1];
  if (!token) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = env('SUPABASE_URL');
  let publishable = env('SUPABASE_ANON_KEY');
  let adminKey = env('SUPABASE_SERVICE_ROLE_KEY');
  // New Supabase key formats use the following JSON maps if legacy keys aren't exposed.
  try {
    if (!publishable) publishable = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')).default;
    if (!adminKey) adminKey = JSON.parse(env('SUPABASE_SECRET_KEYS')).default;
  } catch { /* Missing secrets handled below. */ }
  const resendKey = env('RESEND_API_KEY');
  const sender = env('WELCOME_FROM_EMAIL');
  const siteName = env('WELCOME_SITE_NAME') || '星流 Starflow';
  const siteUrl = env('WELCOME_SITE_URL');
  if (!supabaseUrl || !publishable || !adminKey || !resendKey || !sender ||
      !/^https:\/\//.test(siteUrl)) {
    return json({ error: 'Welcome email service is not configured' }, 503);
  }

  const authClient = createClient(supabaseUrl, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Never trust user IDs or recipient email addresses from the request body.
  const { data: { user }, error: userError } = await authClient.auth.getUser(token);
  if (userError || !user?.id || !user.email) return json({ error: 'Invalid session' }, 401);
  if (!user.email_confirmed_at && !user.confirmed_at) {
    return json({ error: 'Please verify email before welcome mail' }, 403);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await admin.rpc('claim_welcome_email', {
    p_user_id: user.id,
  });
  if (claimError) return json({ error: 'Email state is unavailable' }, 503);
  if (!claimed) return json({ status: 'already-sent-or-processing' });

  const rawName = String(user.user_metadata?.display_name || user.user_metadata?.full_name || '新朋友')
    .trim().slice(0, 60);
  const name = rawName || '新朋友';
  const safeName = escapeHtml(name);
  const safeSite = escapeHtml(siteName);
  const safeUrl = escapeHtml(siteUrl);
  const subject = `欢迎加入${siteName}！你的社交旅程正式开始 ✨`;
  const text = `${name}，你好！\n\n恭喜你成功注册${siteName}！\n在这里，你可以分享生活、发现感兴趣的动态、关注喜欢的人，让每一个想法都有回响。\n\n马上开始探索：${siteUrl}\n\n如果你没有注册这个账号，请忽略此邮件，并通过网站联系我们。\n\n${siteName} 团队`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body style="margin:0;padding:32px 16px;background:#f3f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#213c36"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e1ebe7;border-radius:20px;overflow:hidden"><div style="padding:30px;background:#123f36;color:#fff"><div style="font-size:26px;font-weight:800">✳ ${safeSite}</div><p style="color:#b5e4d4;font-size:14px;margin-bottom:0">连接每一种有趣的声音</p></div><div style="padding:34px 30px"><div style="font-size:42px">🎉</div><h1 style="font-size:25px;line-height:1.4">恭喜你注册成功！</h1><p>亲爱的 ${safeName}，欢迎加入 ${safeSite}！</p><p style="line-height:1.85;color:#536862">从这一刻开始，你可以发布动态、关注感兴趣的人、分享生活中的灵感与瞬间。感谢你成为我们社区的一员。</p><a href="${safeUrl}" style="display:inline-block;margin-top:18px;padding:13px 24px;background:#18876f;color:#fff;text-decoration:none;border-radius:24px;font-weight:700">开启你的社交旅程 →</a><p style="font-size:12px;color:#8b9d96;margin-top:36px">若你没有注册此账号，可以忽略这封邮件。</p></div><div style="padding:18px 30px;background:#f8fbf9;font-size:12px;color:#82958d">© ${new Date().getFullYear()} ${safeSite} · 自动通知邮件</div></div></body></html>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `welcome-user/${user.id}`,
      },
      body: JSON.stringify({ from: sender, to: [user.email], subject, text, html }),
    });
    if (!response.ok) throw new Error(`mail provider returned ${response.status}`);
    const data = await response.json() as { id?: string };
    const { error: completeError } = await admin.rpc('complete_welcome_email', {
      p_user_id: user.id, p_message_id: data.id ?? '',
    });
    if (completeError) throw new Error('Unable to persist delivery state');
    return json({ status: 'sent' });
  } catch (error) {
    console.error('Failed to send welcome email:', error instanceof Error ? error.message : 'unknown');
    await admin.rpc('fail_welcome_email', { p_user_id: user.id });
    return json({ error: 'Welcome email could not be sent; please retry later' }, 503);
  }
});
