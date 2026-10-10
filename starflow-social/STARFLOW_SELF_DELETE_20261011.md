# Starflow AI · 本人账号注销（2026-10-11）

## 数据库现状（执行删除后核对）
已根据用户明确指示，永久删除以下三个测试账号对应的 `auth.users` 记录及级联的 `profiles`、关联关注、通知：`pcw` (`user_67fc768be63b4178af`)、`wz` (`user_5cf2f20608d14c9686`)、`weiaii` (`wei`)。删除返回 3，后续查询验证剩余账户仅 `weizai` (`pcwgf_1437021`)；未触碰主账号。

## 自助注销功能
- Supabase Edge Function `delete-own-account`（服务端版本 1）已在项目部署为 ACTIVE，`verify_jwt=true`。
- 本压缩包新增 `components/StarflowAccountDeletion.tsx` 和 `app/starflow-account-deletion.css`；在 `app/layout.tsx` 保留原组件并追加新组件。
- 登录本人前往「设置」页面滚动至「账号管理」，点击「永久注销我的账号」。二次确认：必须勾选不可恢复提示，输入「永久删除我的账号」。
- 后端独立验证 Supabase Auth JWT，只删除对应 JWT 用户 ID，无论前端如何构造请求，都不允许指定其他用户 ID。
- 服务端尝试清理用户 ID 路径下 `post-media`/`post-videos` 媒体，再通过 Supabase Admin API 删除 Auth 用户，数据库外键级联清理公共资料、帖子、关注关系和通知。
- 没有在其他用户个人主页提供管理删除入口；不存在通过长按删除其他账号的功能。管理其他用户账号必须使用单独的、服务器鉴权的管理员功能。
- 该功能不可逆，请不要用正在使用的主账号测试实际删除。先验证界面弹层、按钮禁用状态、取消功能，正式注销应由本人主动决定。

## 边界及提醒
- 本压缩包不包含任何 service-role 密钥；它仅在 Supabase Edge Function 服务端环境中使用。
- 该包不修改数据库 schema，不自动删除任何现存用户。
- GitHub/Cloudflare 构建与手机浏览器操作尚未验证，必须以真实部署结果为准。
- 尚未实现企业级账号删除冷静期、导出归档、邮件确认与异步删除队列；如面向公众大规模运营，应另行设计并测试。

## 安装
放在仓库根目录并准确命名为 `starflow-release.zip`，仓库现有 Actions 会校验、构建并把 `starflow-social/` 路径下文件写回源码。不要解压上传，也不要重复添加 `.zip` 后缀。此包仅新增/修改四个文件，保留全部现有 UI、帖子、通知、认证和 AI 功能。
