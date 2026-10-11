# Starflow · 所有邮箱 App 一键验证（测试分支，2026-10-11）

目标：QQ 邮箱、网易邮箱、163、Gmail、Outlook 等用户**只需点击验证邮件**，不需要复制链接、切换回注册的浏览器，也不应看到 PKCE 技术报错。

## 实现

- 注册时 `emailRedirectTo` 指向实际域名的 `/auth/confirm`。
- 找回密码时 `redirectTo` 也指向该 `/auth/confirm`，避免 recovery 邮件跨浏览器失败。
- 增加 Next.js Route Handler `app/auth/confirm/route.ts`：只接受 `token_hash` 与 `type=email|recovery`，在服务端调用 `supabase.auth.verifyOtp`，使用 `@supabase/ssr` 把新会话保存到响应 Cookie。
- 确认邮箱成功后重定向到 `/auth/verified`，页面约 1.4 秒后自动进入 Starflow；重置密码成功验证后直接进入 `/auth/reset` 页面。
- 无效/过期/重复使用的链接转到 `/auth/email-error`，不在重定向中暴露原始 token 和内部技术错误。
- 现有 Google OAuth 仍使用 `/auth/callback` 的 PKCE code exchange；此变更不触碰 Google OAuth。
- 本 PR 含模拟 Next.js handler、Supabase 和 cookie 回写的单元测试。不能替代在 iOS 邮件 App 中的真实验收。

## 必须同步更改的**测试** Supabase 邮件模板（运维一次性设置，普通用户不用操作）

此次提交只能修改 GitHub 项目代码，当前 Supabase 连接**不提供 Auth Email Templates 配置写接口**。因此不能声称已改过邮件模板。

只修改 **starflow-staging** 项目：`upzcpajapulmrrkfedxx`。
`Authentication → Email Templates`：

**Confirm signup（确认注册）** 将原来的 `{{ .ConfirmationURL }}` 链接改为：

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">验证 Starflow 邮箱</a>
```

**Reset password（重设密码）** 将原来的确认 URL 改为：

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">重置 Starflow 密码</a>
```

确认`Authentication → URL Configuration`的 Redirect allowlist 包含：
`https://fix-auth-turnstile-check-weizai.weizai.workers.dev/auth/confirm`
以及实际预发布域名（若与此不同）。`Site URL` 设置及其他模板请核对不指向生产数据库。不要在公开仓库提交密钥或真实验证 token。

**必须在 Cloudflare 重新构建/发布包含新代码的预发布分支**；仅修改 Supabase 模板不会让旧版本的前端路由支持新的验证入口。旧邮箱邮件链接不受代码提交影响，必须使用新发送的邮件验收。

## 验收场景

1. 从 iPhone Safari 注册一个全新 staging 测试账号，在 QQ 邮箱 App 内直接点击新邮件中的验证按钮，不复制粘贴 URL；应该显示“邮箱验证成功”，自动进入 Starflow，并能使用此账号。
2. 使用网易邮箱 App / 163 邮箱 App 或 Gmail、Outlook App 重复跨浏览器场景；支持 iOS 内置浏览器与 Android WebView/Chrome。
3. 刷新后会话稳定；进入 Safari 等**另一隔离浏览器**时可能需登录一次（属于不同浏览器 Cookie 隔离，不影响邮箱验证成功，也不需要复制链接）。
4. 用测试账号测试密码找回，从邮件 App 点击链接直达重置密码表单、完成修改。
5. 已使用/过期/篡改验证链接不得建立会话。Google OAuth 授权回调不受影响。
6. 邮件安全扫描程序若预取一次性验证链接，可能导致在人工点击前令牌被消耗；生产扩容前要验证目标邮件系统的扫描行为，并根据需要增加显式确认/扫描防护机制。

验收通过前不合并 PR、不动正式生产设置。

Supabase 官方资料：
- https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
