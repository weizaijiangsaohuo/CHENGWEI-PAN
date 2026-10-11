# Starflow AI · 官方附属账号邀请报错修复

## 修改范围

- `components/StarflowAffiliationManager.tsx`：直接修改原页面组件，不叠加新的页面组件。
- `app/starflow-affiliations.css`：为用户名输入框的实时错误提示增加样式。

## 行为调整

1. 对自己发送邀请（包括 `@weizai`、大小写变体）时，输入框立即提示「不能邀请自己的账号」，禁用发送按钮，不访问数据库。
2. 用户名非 3～24 位英数字或下划线时，直接提示格式错误。
3. Supabase RPC 返回的普通对象错误不再被丢弃；已处理自己邀请、用户名不存在、重复邀请、无组织权限、已有组织关联、邀请已处理、登录失效、网络断开等情况。
4. 发送成功后重新获取真实关联关系，明确提示等待对方接受。关联的创建、撤销权限仍由既有 Supabase 函数负责。
5. 页面正文明确说明必须邀请**另一个已注册**的 Starflow 账号。

## 不包含

- 不新建或删除任何账号；不调整已经通过的金色认证。
- 不执行数据库迁移、不生成假邀请、不自动关联自己。
- 不修改通知、头像编辑、帖子、账号注销等其他功能。

## 检验

- 原组件 TSX 通过 TypeScript `transpileModule` 语法检查。
- 17 组错误翻译与输入验证测试通过。
- CSS 规则解析无错误；ZIP CRC 校验通过。
- 尚未在 GitHub 执行完整项目 `npm run lint` / `npm run build`，也未在真实 iPhone 页面完成回归测试；应以部署结果为准。

## 安装

用本包 `starflow-release.zip` 替换仓库根目录同名文件，GitHub Actions 自动解压到 `starflow-social/` 并构建。上传时必须准确命名，避免 `starflow-release 2.zip` 或 `starflow-release .zip`。
