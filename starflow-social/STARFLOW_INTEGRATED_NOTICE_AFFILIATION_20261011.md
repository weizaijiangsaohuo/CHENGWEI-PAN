# Starflow AI · 认证徽章、站内通知和附属账号整合更新

## 为什么要整合

旧站有金色认证获批记录，但 `StarflowDiscoveryPhase2` 的通知查询没有取 `message`，也没有识别 `verification_approved`，因此将真实的官方审批通知显示成“Starflow 用户与你互动”。
之前“认证与通知升级”ZIP 和“官方附属账号”ZIP 分别覆盖 `app/layout.tsx`，只上传其一会丢失另一套组件的挂载。此包合并两个入口，不移除已上线的账号注销组件。

## 此包包含

- 三色认证：圆润对称波纹认证标志，以后端 `account_verifications` 的 approved 记录为准。
- 通知：真实用户互动、认证审批、违规处理、组织附属邀请／确认／解除；单独的系统筛选，读取 `notifications.message`，每约 30 秒检测可见页面。
- 官方附属账号：管理页、主页徽章、邀请／接受／撤销和通知；并保留本人账号注销功能。
- 数据库脚本保存在 migrations 中用于源码归档。实际数据库迁移已经通过 Supabase 管理连接执行，本次 GitHub ZIP 更新流程不会再次执行数据库 SQL。

## 验收步骤

1. GitHub ZIP Auto Update workflow: Verify and apply, TypeScript check, Production build, Commit all pass.
2. 对源码提交触发的 Cloudflare Workers production build 也显示 success。
3. 手机进入通知中心，看“Starflow 官方系统 → 认证申请已通过”及原始认证文字，不再显示“Starflow 用户 · 与你互动”。
4. 手机打开用户主页检查金色波纹徽章，点击后解释仅 Starflow 内部认证。
5. 设置里能看到“官方附属账号”入口，组织管理页可访问；当前没有已接受的组织关联记录，不应伪造任何附属账号。
6. 账号注销功能仍应存在（勿点击确认删除）。

## 不包含

- iPhone 系统推送；当前仅站内通知。
- 未审核通过的自动违规判定，仍需由后台形成真实处理决定。
- 自动部署确认；本文件只说明代码更新内容，生产上线以构建结果为准。
