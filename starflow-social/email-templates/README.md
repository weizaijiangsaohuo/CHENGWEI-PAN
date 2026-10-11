# Starflow 品牌认证邮件（仅用于 staging）

此目录包含 Supabase Authentication -> Emails -> Templates 可粘贴的 HTML 模板。使用正式 `Brand.tsx` 中的真实品牌图标轮廓渲染为 96×96 PNG，放于 `public/starflow-mail-logo.png`。纯表格、内联 CSS，兼容主流邮件客户端，背景和按钮不会依赖远程 CSS。

### 启用顺序

1. 确认 Cloudflare **测试预览环境**已经发布包含该静态文件的版本，并测试 `https://fix-auth-turnstile-check-weizai.weizai.workers.dev/starflow-mail-logo.png` 可返回正确 PNG，测试站 `/auth/confirm` 可访问。
2. Supabase 项目 **starflow-staging** 的 Authentication -> URL Configuration 中应允许 `https://fix-auth-turnstile-check-weizai.weizai.workers.dev/auth/confirm`。
3. Confirm signup 的 Subject: `【星流 Starflow 官方】请验证你的邮箱`，Body 粘贴 `confirm-signup.html`。
4. Reset password 的 Subject: `【星流 Starflow 官方】重设你的登录密码`，Body 粘贴 `reset-password.html`。
5. 新邮件中的一次性链接使用 `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email` 和 recovery 变体，不要使用旧的 `{{ .ConfirmationURL }}`。
6. 从 QQ、网易/163 等邮箱 APP 打开**新发出的**测试邮件执行端到端验收；正式环境、正式用户暂不更改。

注意：邮件上方显示的 Logo 属于**邮件正文中的图片**。邮箱收件箱列表中的发件人头像由对应邮件服务商决定，还需独立完成域名验证、SPF、DKIM、DMARC 和部分情况下的 BIMI；不能保证所有邮箱都显示自定义发件头像。部分邮件客户端默认屏蔽远程图片，因此 Logo 旁必须保留文字品牌。

正式上线前应把两份模板的 **preview 子域名 Logo 图片地址**替换成长期有效的正式 HTTPS 域名，再与发件身份核对。不得使用未受控的第三方图床或携带 token 的图片请求地址。
