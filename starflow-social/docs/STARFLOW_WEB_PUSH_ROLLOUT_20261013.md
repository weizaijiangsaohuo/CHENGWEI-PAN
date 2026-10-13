# Starflow Web Push · Server Transport Rollout (2026-10-13)

## Shipping status — distinguish infrastructure from actually delivered pushes

1. Subscription UI under /settings/alerts and generic service-worker push/click handlers are implemented.
2. Private SQL subscription table and delivery queue are implemented. New notifications insert only IDs; endpoint/auth keys are hidden from browser table reads.
3. Private Edge Function implementation sends encrypted VAPID notifications via web-push, then acknowledges / retries queue tasks.
4. **Not a working off-browser push system until** the VAPID key pair, service worker public key, Edge Function, and server-only scheduled dispatcher are all configured and a physical iOS PWA/Android phone receives a test notification with Starflow closed. Do not label this completed prematurely.
5. No private DM body, account names or full notification text ever enters the push payload. The service worker ignores payload data and displays a generic badge.

## Stage A: database

Apply `supabase/migrations/20261013103000_web_push_transport.sql`. The SQL does not start an outbound job, and no server key is inserted into code, so it is safe to apply before enabling the sender. Test permissions with `anon`, `authenticated` and `service_role`.

## Stage B: VAPID (privileged operator action)

Generate one stable P-256 VAPID key pair in an approved secure environment. Never commit the **private key** or send it in chats/screenshots.

- Next.js Cloudflare public build variable: `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` = public key only. Rebuild after adding.
- Supabase Edge Function secrets: `SF_WEB_PUSH_VAPID_PUBLIC_KEY`, `SF_WEB_PUSH_VAPID_PRIVATE_KEY`, `SF_PUSH_DISPATCH_TOKEN` (random 32+ character high-entropy token). Supabase Edge Function also requires its built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side secret, never `NEXT_PUBLIC_`.
- Deploy `sf-web-push-dispatch` from `supabase/functions/sf-web-push-dispatch/index.ts` with `verify_jwt=false` **only because** the handler requires `x-starflow-dispatch-token` on every request. Requests fail closed without the token, VAPID pair and service role key.
- Verify no anonymous caller can lease queue jobs or list browser subscription endpoints.

## Stage C: scheduled calls (only after both secrets and Edge Function are working)

The Supabase-supplied `pg_cron` + `pg_net` can call the private Edge Function every minute. Securely save the random dispatcher token in **Supabase Vault** as `sf_push_dispatch_token`. Use the same token configured in Edge Function secret environment. The SQL below is a **manual rollout example**, not executed automatically with migrations. Replace only PROJECT_REF with the correct project identifier. Never paste actual secret into SQL source / git.

```sql
create extension if not exists pg_net with schema extensions;
-- First save the token securely to Vault. Do not paste its value into GitHub.
-- select vault.create_secret('TOKEN_VALUE', 'sf_push_dispatch_token');
select cron.schedule(
 'sf-web-push-dispatch-v1','* * * * *',
 $job$select net.http_post(
  url:='https://PROJECT_REF.supabase.co/functions/v1/sf-web-push-dispatch',
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'x-starflow-dispatch-token',
   (select decrypted_secret from vault.decrypted_secrets where name='sf_push_dispatch_token' limit 1)
  ),
  body:='{}'::jsonb
 );$job$
);
```

Do not enable scheduled calls while the VAPID transport is unavailable; otherwise delivery leases expire and retries accrue without actual pushes. To stop: `select cron.unschedule('sf-web-push-dispatch-v1');`.

## iPhone test requirements

- iPhone Safari: Share → Add to Home Screen → launch installed Starflow PWA.
- Login and open /settings/alerts; enable OS notifications from a direct click, create the device push subscription.
- Trigger one real notification for this account using normal Starflow interaction, put PWA in background, confirm generic OS notification arrives; clicking it must open /notifications.
- Verify opt-out removes the account subscription and that the service worker unsubscribe succeeds; after sign-out/no-login ensure no account-private content appears.
- Repeat on Android where available. Never claim success from CI-only tests.

## Failure behavior and security boundaries

- Web Push is opt-in; without VAPID public key the settings page reports that push is not configured and disables the toggle.
- Failed delivery gets limited retries, 404/410 purges obsolete browser subscriptions, sent/dead logs are cleaned after 14 days.
- The Edge Function must never return endpoint details, user IDs or keys in responses/logs. Only counts.
- The existing Supabase high privilege key had previously been disclosed and remains unrotated; independently rotate it. New feature deployment does not resolve that exposure.
