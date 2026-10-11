# Starflow 预发布邮箱确认跨浏览器修复（2026-10-11）

## 触发问题

iPhone 测试邮箱验证页面提示 `PKCE code verifier not found in storage`，说明邮箱确认链接到达了浏览器，但用于 `exchangeCodeForSession(code)` 的原始 verifier 不在打开链接的浏览器存储中。确认邮件通过邮件 App 或另一浏览器打开是常见路径。

**注意：此错误不代表邮箱一定未验证。** Supabase 可能在重定向之前就已确认邮箱，但当前浏览器未能建立登录会话。用户可先尝试直接登录，切勿依赖旧代码链接完成会话。

## 本 PR 的前端改动

- `/auth/callback` 已支持 `token_hash` + `type=email` 直接调用 `verifyOtp`，此次增加类型校验及 PKCE 错误的中文/英文用户提示。保留旧 `code` 路径以兼容 OAuth。
- `/auth/reset` 新增 `token_hash` + `type=recovery` 验证，保留旧 `code` 路径。新邮件模板配套后，恢复密码邮件可从另一浏览器打开。
- 此 PR 不改正式站配置、用户、密钥或生产数据库。新增的是源码支持，不等于邮件模板已生效。

## 必须在测试项目控制台完成的邮件模板配置

**只编辑 Supabase 项目 `starflow-staging`，不要编辑生产项目！**

Supabase Dashboard → Authentication → Email Templates：

1. **Confirm signup（确认注册）**邮件正文中的确认链接替换为（HTML）：

   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">验证 Starflow 邮箱</a>
   ```

2. **Reset password（重置密码）**邮件正文中的重置链接替换为：

   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">重置 Starflow 密码</a>
   ```

这两个 HTML 变量由 Supabase 模板引擎替换：`RedirectTo` 来自前端传入的完整 `/auth/callback` 或 `/auth/reset` 链接，`TokenHash` 为服务器签发的一次性哈希令牌。切勿把实际 token 放入文档或 PR。此处 `&amp;` 是 HTML 属性中的转义，浏览器会解析成 `&`。

必须检查 **Authentication → URL Configuration**：实际预发布域名的 `/auth/callback` 和 `/auth/reset` 在 redirect allowlist 中，且不会被重定向到生产站点。预发布项目不能使用生产的凭证、邮箱或用户数据。

若模板已通过其他 Auth Hook、SMTP 模板或外部邮件服务覆盖，必须同步修改实际发送邮件的那一份模板。不能只改 React 页面而不改邮件内容。

## 重新验收

- 先在 PR 的 Cloudflare 独立预发布站验证已部署相应分支代码。
- 使用 **新测试邮箱**注册；从与注册不同的浏览器点击确认邮件。URL 应含 `token_hash`、`type=email`，不应只有 `code`（禁止发送带 token 的完整 URL 截图）。
- 观察是否登录成功；再使用测试帐号重新登录、刷新页面确认会话。
- 使用同一个测试账号触发找回密码，从另一浏览器打开链接，确认能显示重设表单，重置密码后旧密码失效。
- 仍需测试 Google OAuth 旧 `code` 流程、过期令牌、重复打开令牌、手机端浏览器及 Turnstile。不能把单一 UI 页面可见当作服务端 Auth 验收成功。
- **未配置邮件模板、未完成真实测试之前不要合并 PR 或部署正式网站。**

官方依据：
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/passwords
