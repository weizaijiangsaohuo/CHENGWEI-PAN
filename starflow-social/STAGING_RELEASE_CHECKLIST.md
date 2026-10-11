# Starflow isolated auth preview validation

This document records the intended **pre-release** workflow for PR #2. It must not be mistaken for production approval.

- Production branch: `main`. Production Supabase project remains separate and unchanged.
- Preview branch: `fix/auth-turnstile-check` on PR #2. Do not merge for preview testing.
- Preview backend: `starflow-staging`, region `ap-southeast-1` (Singapore). No production users, passwords, or application rows are copied.
- Cloudflare Workers > weizai > Settings > Builds > Previews Base must use independent build-time `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` targeting the **staging** project.
- Next.js public environment variables are embedded at build time; verify them in the actual preview before initiating auth tests.
- Preview build command must generate OpenNext artifacts under `starflow-social/.open-next`; preview deploy command is `cd starflow-social && npx wrangler preview`.
- First preview is only for obtaining the actual preview hostname and validating that the branch builds. Registration/login should not be tested until the preview hostname has been added to the Cloudflare Turnstile widget and the sitekey is injected into the preview build.
- Enable Supabase Auth CAPTCHA **only in the staging project**, and only after setting the matching real Turnstile secret in the staging Auth console. Never place a Turnstile secret in Git, public environment variables, screenshots, or chat.
- Configure staging Auth redirect URLs for the actual preview hostname and test email delivery before testing signup confirmation and password reset.
- Keep production Auth CAPTCHA unchanged and PR #2 in Draft until browser-based acceptance passes.

See `AUTH_RELEASE_ACCEPTANCE.md` for validation cases and release gates.
