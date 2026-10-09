# 星流 Starflow | 独立中文社交网站（X 风格）

这是一个**真实使用 Supabase 后端**的 Next.js 社交网站项目，采用原创名称和视觉系统，不冒充 X/Twitter，也不收集 Google / X 密码。它不是纯 HTML 演示，也不是已经替你开通服务器的成品服务。部署前必须由你本人创建项目并配置第三方授权凭据。

## 已编写的功能

- 📱 手机 / 电脑适配的响应式 UI；独立品牌、登录注册页、首页、探索、个人主页、动态详情、书签、通知与设置
- ✉️ 邮箱注册 + 邮箱验证、密码登录、密码找回和重置（真实邮件送达必须另外配置 SMTP）
- 🔐 Google OAuth 正规跳转与回调：同一 Google 按钮用于首次注册或以后登录，无 Apple ID 入口
- 🧩 Cloudflare Turnstile 人机验证；Supabase Auth 服务器端校验 CAPTCHA token（必须在控制台启用）
- ✍️ 280 字动态、图片上传、动态详情与回复、点赞、转发记录、关注、书签、用户检索与通知
- 🛡️ PostgreSQL 行级权限（RLS）、个人数据权限隔离、举报记录、数据库发布限流、安全 HTTP 响应头
- 📧 首次邮箱验证或 Google 注册登录后，调用受保护的 Supabase Edge Function 发送欢迎邮件；同一账户只发一次（需要单独配置 Resend 与已验证发信身份）

## 不包含/仍需建设的功能

**该项目是可部署的基础社交网站，不等于完整 X 产品。** 尚无私信、实时推送、视频转码、算法推荐、搜索索引、运营审核工作台、封禁系统、评论审核、高可用监控、数据库自动备份、规模化压测、端到端自动化测试、完整用户数据导出/删除流程。动态计数采用客户端查询方式，适合小项目，不适合大流量。

官方域名 `x.com`、X 官方品牌、X 的账号和数据均不能被你合法复制为自己的服务；本项目故意使用不同的品牌名称和设计。

## 你需要的账号（仅由账号所有者配置）

| 平台 | 用途 | 免费情况 |
|---|---|---|
| Supabase | 数据库、账户验证、OAuth 统一接入、图片存储 | 免费额度有限，闲置项目可能暂停 |
| Cloudflare Workers | 托管网站，提供免费 `*.workers.dev` 子域名和 HTTPS | 免费额度有限，Next.js 应用需要适配 Workers 构建 |
| Cloudflare Turnstile | 验证人机 | 有免费计划 |
| Google Cloud | Google 登录的 OAuth client id/secret | 需自己的 Google 项目、配置同意屏幕 |
| SMTP 邮件服务 | **必要**：向外部邮箱发送注册确认、找回密码邮件 | 可能有免费额度，需单独验证发信身份及配额 |
| Resend | 新账号首次成功登录后发送独立欢迎邮件 | 有免费额度，但需验证发件域名才能向公众发送 |

**严禁：** 在浏览器端、代码仓库或对话中公开 OAuth client secret、SMTP 密码、Supabase service_role key。`NEXT_PUBLIC_SUPABASE_ANON_KEY` 是可公开的项目匿名密钥；安全性靠数据库 RLS。

## 零到上线的操作

### 1. 创建 Supabase 后端（约定必需）

1. 打开 https://supabase.com/dashboard 新建项目。记下 Project URL 和 `anon` key（Settings → API）。
2. 进入 **SQL Editor**，打开并执行 `supabase/migrations/001_initial.sql`；确认表、触发器和 RLS 策略创建成功。
3. Authentication → Providers → Email：启用邮箱注册，**保持 Confirm email 开启**。
4. Authentication → URL Configuration：Site URL 设为你实际部署的 `https://<站点名>.<workers.dev 或你的域名>`；Redirect URLs 允许：
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/reset`
   - `https://<实际域名>/auth/callback`
   - `https://<实际域名>/auth/reset`
5. Authentication → Emails / SMTP：绑定一个**真实可对外发送邮件的 SMTP 服务**并验证发送身份。**不可直接依赖 Supabase 默认 SMTP**，其默认服务只发给组织中预授权的地址，不支持公众注册。
6. Authentication → Settings / Bot and Abuse Protection：在 Cloudflare 创建 Turnstile widget，向 Supabase 填写**秘密密钥**并开启挑战；在项目 `.env.local` 中填写**公开 site key**。
7. **强烈建议**：开启 Supabase 管理员 MFA、审查 Auth 邮件频率和验证码配置。

### 2. 配置 Google 登录

1. 登录 https://console.cloud.google.com/ ，配置 Google Auth Platform 的同意屏幕、测试/正式发布状态及 OAuth Web Client。
2. 授权重定向 URL（在 Supabase Authentication → Providers → Google 查看）：
   `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
3. 将 Google Client ID 和 Client Secret 填入**Supabase 控制台**，不放进 `.env` 也不要写入前端。
4. 在前端环境变量设置 `NEXT_PUBLIC_GOOGLE_ENABLED=true`。
5. 由 Google 审核哪些 OAuth 范围及品牌信息需要验证，审核时长不可保证。

### 3. 注册完成后自动欢迎邮件（Google 与邮箱共用）

1. 在 SQL Editor 中执行 `supabase/migrations/002_welcome_email.sql`（务必先执行 001 文件）。
2. 创建 [Resend](https://resend.com/) 账号并验证自己拥有的发送域名，生成受保护的 Resend API Key。**没有验证过可对公众发信的域名，不能保证向任意用户邮箱送达。**
3. 在 Supabase → Edge Functions 点击 **Deploy a new function → Via Editor**，新函数名为 `welcome-email`，将 `supabase/functions/welcome-email/index.ts` 完整粘贴进去。
4. 确保该函数的网关 JWT 验证设为 **OFF**（代码自行调用 Supabase Auth `getUser(token)` 校验真实用户身份）；仅部署了函数而未使用其中身份校验逻辑是不安全的。
5. 在 Supabase → Edge Functions → Secrets 中添加：
   - `RESEND_API_KEY`：Resend 私密 API Key
   - `WELCOME_FROM_EMAIL`：例如 `星流 <hello@你已验证的域名>`
   - `WELCOME_SITE_NAME`：网站品牌，例如 `星流 Starflow`
   - `WELCOME_SITE_URL`：你的正式 HTTPS 网站网址
6. 邮件在**邮箱账号完成验证并首次进入网站**，或**新 Google 账号首次授权进入网站**时自动尝试发送；数据库原子认领防止重复发送。重登时不会再次寄送成功邮件。邮件的投递与最终送达取决于提供商设置、额度与收件服务商。
7. 该流程与确认邮箱邮件分开。**注册确认与找回密码仍须在 Supabase Auth 中配置 SMTP**，否则公共用户不能正常收到它们。

**重要：** 本项目通过已登录页面触发欢迎邮件。如果用户只验证了邮件、从未返回网站建立会话，则要等下次进入网站才会发送；它不是完全独立于登录行为的后台事件触发。Resend 的重复发送保护为 24 小时，加上数据库永久发送记录降低重复邮件风险。需要无论用户是否登录都立即寄送，则后续应增加经过认证的 Auth 事件 Webhook / 可靠任务队列。

### 4. 本机启动

需要 Node.js 20 或更高版本，并保证网络可从 npm 下载依赖。

```bash
npm install
cp .env.example .env.local
# 编辑 .env.local，把公开 URL / anon key / Turnstile site key 填写正确
npm run dev
```

打开 `http://localhost:3000`。**当 Supabase 地址和公开 anon key 尚未填写时，登录按钮会禁用**，以防误以为模拟数据是真实账号。

### 5. 目标部署到 Cloudflare Workers

此项目当前是 **Next.js 15 源码**，并不是开箱即用的 Cloudflare Worker。不能直接上传 ZIP 到 Workers 后宣称可以上线。

1. 将项目源码放入 GitHub 仓库，按 Cloudflare OpenNext/Workers 的当前官方兼容性要求完成适配、构建与测试。
2. 在 Cloudflare Workers & Pages 中连接 GitHub 项目，配置构建与部署流程。
3. 通过 Cloudflare Dashboard 配置前端环境变量（Supabase URL、可公开 anon key、Turnstile site key、Google 按钮开关）。
4. 获得真实的 `https://<worker-name>.<account>.workers.dev` 访问地址后，将它加入 Supabase 的站点 URL 与回调白名单，以及 Turnstile 允许域名。
5. 实测邮箱验证、找回密码、Google OAuth、欢迎邮件、RLS 多账号隔离和移动端页面后，再向公众开放。

Cloudflare Workers 提供免费额度内的 `workers.dev` 子域名与 HTTPS；可用性、Next.js 兼容性及构建配额以官方当时规则为准。**此源码包还没有完成 Workers 部署适配与联网端到端测试。**

### 6. 域名、可信证书与“官网认证”区别

- `*.workers.dev` 是 Cloudflare 免费**平台子域名**，实际 Worker 发布后提供 HTTPS。
- 自己的 `example.com` 是**独立域名**，一般需付费注册；零元预算就使用平台提供的子域名。
- 浏览器 HTTPS/锁图标只证明连接加密及域名控制，不等于企业实名认证或第三方信誉担保。
- Google OAuth 认证的是你在 Google 创建并授权的应用；无法“自行生成官方认证证书”。
- 如果面向中国大陆提供互联网信息服务，需要另行核实适用的备案、许可证、用户数据和内容治理要求；免费方案不意味着自动合规。

## 安全注意事项

- `supabase/migrations/001_initial.sql` 定义了操作权限和通知生成的数据库触发器；不要关闭 RLS，也不要使用 `service_role` 作为前端密钥。
- 数据库的 `post_rate_guard` 每账号限制为至少间隔 5 秒发帖，并覆盖客户端传入时间；这**不是**对整个互联网的完整反滥用/反机器人服务。
- Turnstile 验证不是光放一个前端按钮：务必启用 Supabase Auth 的 CAPTCHA 开关及服务端密钥校验。
- 注册确认与找回密码需要正常可对外投递的 SMTP 服务器；邮件额度、域名验证和投递率取决于供应商。
- 后台可以在 Supabase 的 `reports` 表查看举报，但没有专门审核系统；开放公众前需建设内容审核与违规处理流程。
- Supabase 免费计划无自动可下载备份，请自行规划备份和恢复机制。
- 首次开放注册前，完成独立安全审计和真实多用户测试。**本项目未经联网集成测试，不保证即刻生产可用。**

## 官网参考

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://resend.com/docs/dashboard/domains/introduction
- https://developers.cloudflare.com/turnstile/get-started/

---

## V3 UI / 双语与管理中心（2026-10）

本版本新增统一的黑白 + 靛蓝视觉系统，优化桌面三栏布局、iPhone 底部导航、首页动态、探索、通知、书签、个人主页与设置页。`components/LanguageProvider.tsx` 和 `lib/i18n.ts` 为实际 App 提供 🇨🇳 简体中文 / 🇺🇸 English 切换，语言设置在浏览器 localStorage 中保存。注册/登录已保留 Google OAuth 与邮箱方式，不提供 Apple 登录。

独立的 `preview.html` 是**可在手机打开的交互演示**：内含模拟账号、模拟图片、动态操作、搜索、注册/登录界面以及管理工作台。它不连接 Supabase，不会发送邮件或真的修改服务器数据，也不能代表真实的性能和规模。

### 后台管理安全开启

1. 在已执行 `001_initial.sql`、`002_welcome_email.sql` 后执行 `supabase/migrations/003_admin_studio.sql`。
2. 在 Supabase 的 Authentication → Users 找到你自己的用户 UUID。**不要把 UUID 当作密钥；也不要向其他用户授权。**
3. 在 SQL Editor 以项目管理员身份手动执行以下语句（把占位 UUID 换成你自己的）：

```sql
insert into public.platform_admins(user_id)
values ('YOUR-AUTH-USER-UUID');
```

4. 重新登录后可在左侧导航或直接通过 `/admin` 进入；没有管理员角色的普通用户即使手动打开 URL，也不能取得举报队列或执行审核。

后台目前支持读取真实用户数、动态数与待审核举报数，以及标记举报已审核。没有实现全量管理（账号封禁、申诉、删除全部资料、审计日志等），**不能将其当成大型平台成熟风控系统**。

### 托管说明

- 可先用本地 Next.js 开发服务器检查功能：`npm install`、`npm run dev`。
- Cloudflare Workers 部署 Next.js 15 通常需按照当前 Cloudflare/OpenNext 支持文档做适配，**此代码包目前尚未实测 Cloudflare 构建和上线**。
- Supabase、Turnstile、Google OAuth、Resend 邮件发送都需要在各服务控制台配置合法的域名、授权回调和密钥。前端只放公开的 Supabase URL、publishable/anon key、Turnstile site key。后端密钥仅写入服务端环境变量。
- `privacy` 与 `terms` 是双语示例文本，真正对外运营前必须替换为与业务、主体和法律适用地相符的正式版本。
