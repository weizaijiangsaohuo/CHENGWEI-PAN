import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=['package.json','app/layout.tsx','app/globals.css','app/page.tsx','app/auth/callback/page.tsx','app/auth/reset/page.tsx','components/AuthPortal.tsx','components/SocialApp.tsx','lib/supabase.ts','supabase/migrations/001_initial.sql','supabase/migrations/002_welcome_email.sql','supabase/functions/welcome-email/index.ts','lib/welcome.ts','README.md','.env.example'];
for(const f of files) assert(fs.existsSync(path.join(root,f)),`Missing required file: ${f}`);
const sql=get('supabase/migrations/001_initial.sql');
for(const name of ['profiles','posts','follows','likes','reposts','bookmarks','notifications','reports']){
  assert(sql.includes(`create table public.${name}`),`Missing table ${name}`);
  assert(sql.includes(`alter table public.${name} enable row level security`),`Missing RLS ${name}`);
}
assert(sql.includes('pg_advisory_xact_lock')&&sql.includes('new.created_at := now()'),'Rate limit must not trust caller timestamps');
assert(sql.includes('storage.foldername(name)'),'Storage uploads must be user scoped');
assert(sql.includes('grant update (read_at) on public.notifications'),'Notifications update should be column limited');
const auth=get('components/AuthPortal.tsx');
for(const part of ['signUp({','signInWithPassword({','resetPasswordForEmail(','signInWithOAuth({','captchaToken','<TurnstileChallenge'])assert(auth.includes(part),`Missing auth flow: ${part}`);
const challenge=get('components/TurnstileChallenge.tsx');
for(const part of ['challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', "'expired-callback'", "'error-callback'", 'turnstile.remove(widgetId)'])assert(challenge.includes(part),`Missing Turnstile lifecycle: ${part}`);
for(const method of ['signUp','signInWithPassword','resetPasswordForEmail']){
  const call=auth.slice(auth.indexOf(`supabase.auth.${method}(`)).split('if(error)')[0];
  assert(call.includes('captchaToken:captchaToken||undefined'),`${method} must send the CAPTCHA token`);
}
assert(auth.includes("if(siteKey&&!captchaToken)"),'Configured CAPTCHA must guard form submission');
assert(auth.includes('finally{setBusy(false);resetCaptcha();}'),'Consumed CAPTCHA tokens must be reset after requests');
assert(!/provider:'apple'|NEXT_PUBLIC_APPLE_ENABLED|使用 Apple 继续/.test(auth),'Apple auth must be removed');
assert(auth.includes("process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'"),'Google auth must remain disabled until configured');
const mailSql=get('supabase/migrations/002_welcome_email.sql');
assert(mailSql.includes('welcome_email_deliveries enable row level security'),'Welcome mail state must have RLS');
assert(mailSql.includes('claim_welcome_email'),'Welcome sending must be claimed atomically');
const mailFn=get('supabase/functions/welcome-email/index.ts');
for(const part of ['auth.getUser(token)','Idempotency-Key',"admin.rpc('claim_welcome_email'",'RESEND_API_KEY']) assert(mailFn.includes(part),`Missing secure welcome mail requirement: ${part}`);
assert(get('lib/welcome.ts').includes("functions.invoke('welcome-email'"),'Verified sessions must trigger server welcome mail');
const app=get('components/SocialApp.tsx');
for(const part of ['publish(','toggle(','follow(','deletePost(','reportPost(','saveProfile(','markRead(','storage.from'])assert(app.includes(part),`Missing social action: ${part}`);
assert(get('app/auth/reset/page.tsx').includes('exchangeCodeForSession(code)'),'Recovery redirect must exchange PKCE code');
for(const f of files){assert(!/sk_live_[0-9a-zA-Z]{16}|service_role\s*[:=]\s*['\"][a-z0-9._-]{20}/i.test(get(f)),`Potentially embedded secret in ${f}`)}
console.log(`PASS: ${files.length} essential files exist`);
console.log('PASS: 8 social tables have RLS; critical authorization triggers and guards found');
console.log('PASS: email, recovery, OAuth, CAPTCHA and main social flows wired');
console.log('PASS: Google is gated; Apple removed; welcome-email uses verified server-side identity and DB claim');
console.log('NOTE: Static assertions only. This does not test DB, Cloudflare deployment, SMTP, Resend delivery, OAuth, browser UI or HTTPS.');
