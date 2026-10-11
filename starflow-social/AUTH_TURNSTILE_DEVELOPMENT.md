# Authentication Turnstile fix — development checkpoint

Branch: `fix/auth-turnstile-check`
Base: `b7c08b2` (main)
Implementation commit: `2958b28`

## Cause and change

AuthPortal had no Turnstile widget and sent no CAPTCHA token to Supabase email authentication. The static check exposed a real missing integration. Restore optional Turnstile rendering using the existing public site-key configuration; send tokens for registration, password login and password recovery. Clear expired/error tokens, remove widgets on unmount, and recreate verification after requests and mode changes. Preserve the existing unconfigured behavior with its configuration notice and preserve Google OAuth.

The check now follows the extracted component and verifies token wiring for all three email flows, submission guarding and widget lifecycle.

## Validation (2026-10-11)

- npm ci --no-audit --no-fund: passed; existing transitive dependencies emitted deprecation notices.
- npm run check: passed (static assertions).
- npm run lint: passed (tsc --noEmit).
- npm run build: passed (Next.js 15.5.27; 22 static pages generated).
- git diff --check: passed.

No live CAPTCHA, email delivery, OAuth or database integration tests were performed. No production configuration, database, credentials, deployment or main branch changes were made.

## Initial publication blocker (resolved)

Git push returned HTTP 403: Permission denied. The GitHub connector also returned HTTP 403, Resource not accessible by integration, when creating the remote branch. No remote branch or PR was created. Repository metadata reported push/admin permissions, but actual integration write access is unavailable.

Restore repository write access for the GitHub integration, fetch the current remote state, push this existing branch, and create a Draft PR targeting main. Do not redo the implementation. If main changed, reconcile it and rerun relevant checks. Do not merge or deploy automatically.

## PR #2 review checkpoint (2026-10-11)

Repository authorization was restored and the existing commits were pushed. Draft PR: https://github.com/weizaijiangsaohuo/CHENGWEI-PAN/pull/2 . The initial 403 publication blocker above is historical and resolved.

Review fix commit: b286d53. Added synchronous submission and token guards, blocked mode changes during pending requests, handled widget timeout/render failures, and used a flexible widget. Seven mocked component-handler regression tests were added to npm run check. Static checks, mocked tests, TypeScript, Next.js production build, Cloudflare OpenNext build and GitHub CI passed. main at b7c08b2 is conflict-free. No live authentication/configuration verification, merge or deployment was performed. See AUTH_RELEASE_ACCEPTANCE.md for configuration requirements and the mobile acceptance checklist.
