# STARFLOW V2 上线前安全核验（2026-11-23）

> 范围：仅限 `feature/neon-backend-foundation-20261120` / PR #59、Cloudflare **指定命名预览** `e2b1338f1c484b85b5fa4713bde33bf1`、Neon 项目 `green-paper-58941826` 的 `starflow-staging` 分支 `br-lively-surf-b3h216tu`。**此报告不是上线许可，不代表生产环境已验收。** 不包含任何令牌、密码、真实用户或个人身份数据。

## 已由连接的服务接口验证

- [x] GitHub：PR #59 仍为 open，目标为 `main`；测试功能分支独立，未合并；新增预览安全检测测试。
- [x] Cloudflare：命名预览已配置 `STARFLOW_AUTH_DB_URL`、`STARFLOW_BUSINESS_DB_URL`、`STARFLOW_FRESH_DB_URL`、`STARFLOW_REGISTRATION_DB_URL`、`STARFLOW_MAIL_DB_URL`；全部以 `secret_text` 加密绑定。
- [x] Cloudflare：`STARFLOW_PREVIEW_OWNER_KEY`、`BREVO_API_KEY`、`CLOUDINARY_API_KEY`、`CLOUDINARY_API_SECRET` 均有加密绑定；**仅验证存在，无法读取或验证实际值**。
- [x] Cloudflare：`STARFLOW_V2_PREVIEW_ONLY=true`，`STARFLOW_V2_ENABLED=false`；注册、账号初始化、邮件发送、Cloudinary 上传开关均为 `false`。
- [x] Neon：预览直连目标为 `ep-plain-snow-b3x6hb9a.c-4.ap-southeast-1.aws.neon.tech`，非 `-pooler`；预览数据库 `neondb` 有 41 个非系统表/视图。
- [x] Neon：`sf_auth_runtime`、`sf_business_connect`、`sf_fresh_account_connect`、`sf_registration_connect`、`sf_mail_budget_connect` 五个独立受限登录角色在 **staging 分支** 通过认证与基础权限检查。
- [x] Neon：四组业务、账号初始化、注册、邮件委托角色分别只能 `SET ROLE` 至指定网关，不能直接继承网关权限；无公共 schema CREATE 权限。
- [x] Brevo：已连接账户套餐为 Free，每天 300 封发送额度，SMTP relay 启用；一个发件人状态为 active；已验证的独立发信域名数量为 0。仅证明账户状态，不证明真实收件箱送达。
- [x] Cloudinary：已连接账户为 Free，25 credits 配额的使用为 0；仅证明账户配额，不证明现有预览密钥的上传授权。
- [x] GitHub：提交安全测试后，自动运行代码检查、服务/认证/数据库及 UI 测试；具体结果以当前提交 CI 为准。

## 未完成的门禁 / 不可视为正式上线

- [ ] **GitHub Actions 的 `STARFLOW_PREVIEW_OWNER_KEY` 同步**：Cloudflare 已有该密钥，但加密值不能读取；当前已连接 GitHub 工具不能写入 Actions Secrets。需要拥有者把**同一串新的随机 64 位小写十六进制密钥**分别存到 GitHub 仓库 Actions Secrets 和 Cloudflare 的**指定测试预览**密钥中。**不得发送到聊天、提交仓库或替换生产密钥**。
- [ ] **执行真实授权的只读预览探针**：`/api/v2/readiness`、`/api/v2/registration-readiness`、`/api/v2/provider-readiness`；GitHub 有 `deployed-preview-smoke.mjs` 可执行，要求上述 GitHub Secret。无密钥的模拟测试或匿名拒绝测试不能代替。
- [x] **注册邮件服务端适配代码**：已在独立预览入口接入 `createPreviewRegistrationMail()`。仅在完全独立的测试分支、全部显式开关启用、预览 owner key 不存在、存在独立收件人 HMAC 密钥且经过操作者账单确认时才构建适配器；每次发送前只读检查 Brevo 活跃发件人、Free 计划和数据库配额。代码接入完成不代表开通真实发送。
- [ ] **真实邮件功能启用与送达验收**：需由拥有者在 Brevo 账单页面确认无付费额度、自动升级或付费扣款路径，再由拥有者明确批准仅在测试环境配置 `STARFLOW_BREVO_BILLING_FREE_ONLY_VERIFIED=true`（人工签核，不是自动账单证明）、`STARFLOW_BREVO_SENDER_EMAIL`（须为 API 确认的 active 发件人）和独立 Cloudflare secret `STARFLOW_MAIL_RECIPIENT_SECRET`（至少 32 字符且不能重复数据库密码、Better Auth 密钥或 Brevo API key）。完成后还需测试账号真实邮件收件箱验收。严禁因测试失败而跳过账单验证、泄露密钥、默认启用发送或配置到生产环境。
- [ ] **测试邮件阶段的单独准许**：`STARFLOW_V2_ENABLED`、`STARFLOW_FRESH_PREVIEW_ENABLED`、`STARFLOW_REGISTRATION_PREVIEW_ENABLED` 和 `STARFLOW_BREVO_SEND_ENABLED` 仍保持 false；不能为了代码验证擅自开启。owner key 的存在会阻断测试注册功能，只有全部授权测试通过且单独批准后才能切换到受保护的真实注册验收模式。
- [ ] **浏览器端端到端验收**：iPhone Safari / Android Chrome，验证码、注册、登录、密码找回、用户隔离、发帖/评论/通知、附件上传、回滚和异常恢复。CI 模拟通过不代表此项通过。
- [ ] **域名与合规/运营验收**：选定公开域名、邮件发件身份与验证策略；落实适用的隐私、服务条款、内容治理与平台审核。如涉及 QQ / 抖音小程序，上架/备案/权限审核与网站发布分开处理。
- [ ] **人工最终发布许可**：上述项目均通过并选择上线范围后，才决定合并 PR #59、配置**独立生产**环境、逐步开启发布开关、监控与回滚。不得自动合并、自动开启 `STARFLOW_V2_ENABLED` 或将测试数据/密码复制到正式库。

## 自动化安全界线

- GitHub 只读预览探针仅访问固定的三个 GET 接口，不发送邮件、不上传媒体、不读取用户内容。
- 如发现预览注册功能意外开启，预览探针必须报错而不是通过；提供配套自动化回归测试。
- 所有测试对象均为 staging，不修改正式环境数据库或密钥；不得在 CI 日志中打印环境密钥。
- 2026-10 旧版 Supabase / PR #2 上线清单为历史材料，不应代替本份 V2/Neon 的上线门禁。
