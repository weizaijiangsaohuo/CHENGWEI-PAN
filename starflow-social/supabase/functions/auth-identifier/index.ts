// Supabase Edge Function: auth-identifier
// Resolve a public username privately, then authenticate via Supabase Auth.
// No user email is returned to anonymous callers; a valid CAPTCHA is required.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const allowedOrigins = new Set([
  'https://weizai.weizai.workers.dev',
  'https://fix-auth-turnstile-check-weizai.weizai.workers.dev',
]);
const headersFor = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
  'Vary': 'Origin',
});
const send = (body: Record<string, unknown>, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
const badLogin = (origin: string) => send({ error: '账号或密码不正确，请检查后重试。' }, 400, origin);
const recoveryNotice = (origin: string) =>
  send({ ok: true, message: '如账号存在，且预留邮箱可正常收信，系统将发送重设密码邮件。' }, 200, origin);

Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? '';
  if (!allowedOrigins.has(origin)) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin) });
  if (request.method !== 'POST') return send({ error: '不支持此请求' }, 405, origin);
  try {
    const text = await request.text();
    if (text.length > 4500) return send({ error: '请求过长' }, 413, origin);
    const body = JSON.parse(text) as Record<string, unknown>;
    const action = body.action;
    const handle = typeof body.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const captcha = typeof body.captchaToken === 'string' ? body.captchaToken : '';
    if (!['login', 'recover'].includes(String(action)) || !/^[a-z0-9_]{3,24}$/.test(handle) ||
        captcha.length < 20 || captcha.length > 4096 || (action === 'login' && !password)) {
      return send({ error: '请填写有效的用户名并完成人机验证。' }, 400, origin);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRoleKey) {
      return send({ error: '身份验证服务暂不可用，请稍后再试。' }, 503, origin);
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const found = await admin.from('profiles').select('id').eq('handle', handle).maybeSingle();
    if (found.error) return send({ error: '身份验证服务暂不可用，请稍后再试。' }, 503, origin);
    let email = '';
    if (found.data?.id) {
      const user = await admin.auth.admin.getUserById(found.data.id);
      if (user.error) return send({ error: '身份验证服务暂不可用，请稍后再试。' }, 503, origin);
      email = user.data.user?.email ?? '';
    }
    // Use the same GoTrue verification path for unknown usernames to avoid leaking account existence.
    const candidate = email || 'missing-username@invalid.example';
    if (action === 'recover') {
      await auth.auth.resetPasswordForEmail(candidate, {
        redirectTo: origin + '/auth/confirm',
        captchaToken: captcha,
      });
      return recoveryNotice(origin);
    }

    const result = await auth.auth.signInWithPassword({
      email: candidate,
      password,
      options: { captchaToken: captcha },
    });
    if (result.error || !result.data.session) return badLogin(origin);
    return send({
      session: {
        access_token: result.data.session.access_token,
        refresh_token: result.data.session.refresh_token,
      },
    }, 200, origin);
  } catch {
    return send({ error: '请求失败，请稍后重试。' }, 503, origin);
  }
});
