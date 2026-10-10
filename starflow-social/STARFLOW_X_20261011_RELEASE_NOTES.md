# Starflow AI · X 风格信息流升级（2026-10-11）

## 本次更新是什么

在已有 Next.js + Supabase 站点上叠加一批可撤销的 UI 与真实互动升级，而**不是**两份完整需求文档共 24 章的最终验收版本。

- 已登录桌面端：X 风格三栏、紧凑导航、清晰帖子信息密度、吸顶内容切换标签、粉紫品牌动效。
- 响应式：保留手机底部导航及安全区，优化手机帖文、发布器与内容区布局。
- 新增真实的右侧栏 React 组件：话题检索跳转，最近最多 150 条公开帖子的标签统计（非平台全量趋势）；展示真实 Supabase 账号、关注操作及动态推荐；社区、创作者、AI 客服与认证中心真实路由。
- 数据与功能：不迁移表结构，不变更用户身份和 RLS 策略，不触碰历史帖文、通知、评论、图片、视频、投票和认证数据。原有左侧导航、帖子操作全部保留。
- 登录页的完整重构、完整趋势排名、个性化推荐算法、个人资料功能扩展、Spaces、付费订单与自动续费、24 章终验仍未完成。

## ZIP 结构和使用

ZIP 内每个路径以 `starflow-social/` 开头，符合目前 `.github/workflows/starflow-zip-auto-update.yml` 的路径约束。仅包含以下新增或修改的文件：

1. `starflow-social/app/layout.tsx`：加载覆盖样式与右栏组件，保留原始布局及语言 Provider。
2. `starflow-social/app/starflow-x.css`：独立的 X 风格覆盖样式，全部限定于 `.app-frame`（右栏内部样式单独限定 `.sf-discovery`）。
3. `starflow-social/components/StarflowDiscovery.tsx`：右侧真实话题与推荐关注功能，无独立数据库迁移。
4. `starflow-social/STARFLOW_X_20261011_RELEASE_NOTES.md`：本文件。

先保存 GitHub 当前提交以备回滚，再将此 ZIP 改名或上传为仓库根目录的 `starflow-release.zip`，替换仓库现有同名文件并提交到 `main`。当前自动更新工作流将尝试完整 TypeScript 检查与 Next.js 构建，成功后把源文件提交回仓库。**上传 ZIP 与构建就绪不等同于 Cloudflare 生产站点的端到端验收。** 不要在构建失败时重复上传相同文件；应检查 GitHub Actions 构建日志。

## 验收计划

- 电脑版检查三栏布局、账号关注、近期话题筛选、导航与回滚。
- iPhone / 平板检查底部导航、发布区遮挡、横向溢出、视频播放、图片上传。
- 登录 / 未登录两种状态检查 `/support` AI 客服是否实际响应。
- 检查蓝/金/灰认证徽章说明，以及普通用户无法提升自己的认证状态。
- 检查数据库迁移及所需后端 API 的线上服务状态；这批文件不包含这类后台升级。

## 验证状态

ZIP 完整性、路径与扩展名已本地校验；TSX 转换语法和 CSS 解析已检查。**尚未执行完整 npm install、npm run lint、npm run build、Supabase 联调、Cloudflare 线上及多设备测试。**
