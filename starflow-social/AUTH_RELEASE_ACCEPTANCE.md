# PR #2：认证上线前验收

## 结论和边界

PR 与 main（b7c08b2）无代码冲突。代码验证通过后可以进入预发布验收；在真实认证流程及服务端配置验收完成前，不应直接向公众上线。此次没有读取私密密钥，没有访问线上数据库，也没有修改生产配置、合并或部署。

## 配置要求（尚未验证控制台实际状态）

- Cloudflare Turnstile 应选择 Managed widget，并将实际网站域名加入允许的 hostnames。预发布域名也需要允许；本地模拟测试不能证明真实域名配置正确。
- 前端只使用公开的 NEXT_PUBLIC_TURNSTILE_SITE_KEY，通过 Next.js Script 加载 Cloudflare 官方脚本并以 explicit 模式创建 widget。生产构建时必须提供正确的公开 site key；NEXT_PUBLIC_* 会被内联进浏览器代码，部署后仅改运行时变量不能保证已构建代码更新。
- Supabase Authentication 的 Bot and Abuse Protection 应启用 CAPTCHA，provider 选择 Cloudflare Turnstile，并由账号所有者在 Supabase 控制台配置该 widget 对应的私密 secret key。secret 不进入前端、NEXT_PUBLIC_*、GitHub 或验收记录。
- 浏览器把验证码结果交给 Supabase Auth；Supabase 在服务端验证，不应添加浏览器直接使用 secret 调用 Siteverify 的代码。
- site key 缺失时保持项目原有未配置行为并展示提示；这不是生产验收通过。前端配置与 Supabase CAPTCHA 开关必须一致，否则可能被服务端拒绝，或在服务端未启用 CAPTCHA 时缺少防机器人保护。
- 邮件确认、SMTP、Site URL 与 /auth/callback、/auth/reset 的 redirect allowlist，需要账号所有者在控制台确认。Google OAuth 保持原有开关及回调。
- 若有额外 CSP 或网络过滤，需允许 challenges.cloudflare.com 的脚本和 iframe。不要通过关闭服务端 CAPTCHA 来掩盖加载失败。

## 请求与状态处理

- 注册：signUp 的 options.captchaToken。
- 密码登录：signInWithPassword 的 options.captchaToken。
- 找回密码：resetPasswordForEmail 第二个参数的 captchaToken。
- 同步 ref 锁阻止同一事件周期内重复请求，处理期间不允许切换认证模式；输入中的验证码不会被重复发送。
- 同步 token ref 防止过期回调发生后旧的 submit closure 仍提交过期令牌。
- 已完成请求无论成功或失败都会清除令牌并重新创建 widget。Cloudflare 令牌有效期为 300 秒且只能使用一次；最终是否有效由服务端决定。
- widget 的过期、挑战超时与错误回调清除 token；脚本加载失败或 render 抛错展示错误并阻止无 token 提交。脚本失败时提示刷新重试；没有声称离线状态可完成认证。
- 卸载移除 widget，忽略已卸载实例的迟到回调；flexible widget 用于适应移动布局。

## 已验证与未验证

代码检查：npm run check（现有静态断言及 7 项认证模拟测试）、npm run lint、npm run build。模拟测试执行真实组件处理器，但替换 React hooks 与外部服务，不是浏览器或真实服务端端到端测试。

npm run build:cloudflare 已通过，生成本地 .open-next/worker.js，未部署。GitHub CI 的 TypeScript 与生产构建检查也已通过。npm run verify 是上线后对实际 HTTPS 域名的健康检查；本次没有发布，也未提供验收域名，所以该检查待人工验收。

## 手机端验收清单（在独立测试账号和预发布环境执行）

- [ ] iPhone Safari 和 Android Chrome：验证码、注册和登录表单完整可见；窄屏无横向溢出，键盘弹出后仍可提交；中英文切换正常。
- [ ] 验证完成前无法提交；验证码完成后可提交；等待超过 5 分钟后需要重新验证。
- [ ] 快速双击或连续按回车只触发一次请求；请求中不能切换注册/登录/找回密码。
- [ ] 注册：合法昵称及至少 6 位密码可提交；允许数字、英文字母、符号（纯数字如 123456 技术上可用，但安全性很弱，界面应建议使用更强密码）；邮件确认可送达并返回正确回调；按既有设置决定是否直接建立会话。
- [ ] 登录：正确密码成功，错误密码显示错误，重新验证后可再次登录；刷新页面保持正确会话。
- [ ] 找回密码：邮件送达 /auth/reset，链接只允许本人重置；重置后新密码可用，旧密码失效。
- [ ] 模式切换清除旧验证码；验证码过期、挑战超时、网络失败、Cloudflare 脚本被阻止后，按钮状态和错误提示正确，恢复网络/刷新后可重试。
- [ ] 后端拒绝缺失、无效、过期或重用的 token；由测试环境验证，不能只看按钮禁用状态。
- [ ] 若启用 Google：验证授权、回调、取消和失败路径，没有密码/验证码变更导致的回归。
- [ ] 登录后用两个测试账号验证发帖、回复、关注、通知、退出登录和账号隔离；移动端返回/前进和刷新正常。
- [ ] 正式发布前核对目标域名、公开构建变量、Turnstile hostnames、Supabase CAPTCHA provider/开关、邮件及 redirect allowlist；不在截图、日志或 PR 中公开私密密钥。
- [ ] 在实际验收域名运行 npm run verify -- https://验收域名，确认 HTTPS 和健康接口；健康接口通过不能替代上述登录测试。

参考：
- https://supabase.com/docs/guides/auth/auth-captcha
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
