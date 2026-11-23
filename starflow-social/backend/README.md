# Starflow Neon backend foundation — phase 1 (not deployed)
2026-11-20. Based on repaired main a8c72f27. No real database or paid service created.
## Scope
New isolated sf_core schema, stable principal UUIDs, explicit unique Better Auth subject mapping, private profile rows and column-limited runtime role. This is not a working authentication system. Old 34 Supabase migrations, application routes and production environment are unchanged.
## Why this is needed
001_initial.sql ties profiles to auth.users and uses auth.uid(), storage.objects and notification triggers; 20261012_signup_custom_handle.sql reserves privileged names; 20261012001030_starflow_admin_role_foundation_20261012.sql ties grants to auth.users; 20261011_dm_blocks_and_read_receipts.sql uses auth.uid() for DM membership. These are not portable merely by changing a connection string.
## Mandatory next gates
- Create owner's free Neon account + isolated dev project, confirm region, quota, connection security. No credit card or paid upgrades. Validate migration role creation / privileges on Neon; do not use owner or BYPASSRLS for runtime.
- Better Auth: pin audited release, generate official schema with UUID IDs (advanced.database.generateId: "uuid"), validate Cloudflare runtime driver; implement trusted session -> principal binding. Never bind by matching email/handle or allow client-submitted role. No automatic founder restoration; verify original owner separately, MFA and recovery. Handle reservation, signup transactions, email ownership verification, username/password, passkeys, TOTP and session revocation before exposing routes.
- Runtime credential stays in Worker Secret. Only trusted parameterized server statements can use sf_profile_runtime; transaction-local set_config('sf.principal_id', verifiedPrincipalUUID, true) and data query in SAME transaction/connection, not user-supplied value. This GUC is not proof of identity and must never be exposed to arbitrary SQL or browser. Pool cleanup regression test with actual Neon adapter. No grants to browser, no public profile listing yet.
- Port posts/likes/follows/bookmarks/private accounts/blocks/DMs/notifications/admin/RLS before traffic switch; preserve visibility policies, rate limiting and deletion semantics. Then media private access, Brevo emails, realtime, scheduled tasks and Didit; enforce free limits and fail closed. Preserve old schema and data, do not destroy old services.
- Migrate only legally available backup, verify counts/IDs and storage integrity; if unavailable, get owner approval for fresh data. No password hash migration or claim by email without verified recovery. Stage with synthetic users and cross-user authorization tests; rollback plan and device acceptance before production.
- Schema is intentionally one-time for a fresh isolated database; existing role/schema collision aborts. CI tests use disposable PostgreSQL and no cloud credentials.
## Docs
https://better-auth.com/docs/concepts/database
https://neon.com/docs/serverless/serverless-driver
