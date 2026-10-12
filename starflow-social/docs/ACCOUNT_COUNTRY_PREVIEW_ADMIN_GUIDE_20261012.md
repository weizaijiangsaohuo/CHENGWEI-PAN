# Starflow「关于此账号」国家/地区功能：部署与隐私验收

更新：2026-10-12。

## 故障现象

用户在 `/profile/<handle>/about` 中点击「识别并更新本次访问的国家／地区」，页面显示「日本（本次预览，未保存）」。此时 Cloudflare 请求元数据中有大致国家代码，但后端故意没有执行数据库更新。

**原因**：`/api/account/location` 只有在 Cloudflare Workers 服务器端存在 `SUPABASE_SERVICE_ROLE_KEY`（并且当前用户已登录、主动选择公开）时才执行安全写入。如果运行时缺少这个 secret，就返回 `saved:false`。前端不能自行伪造 `saved:true`。

## 安全配置（需具备正式环境管理权限的管理员操作）

1. 确认正式项目 Supabase 的 `account_ip_country` 表、RLS 和 `sf_set_account_country_public` RPC 对应迁移 `20261011_account_about_country.sql` 已正确安装。
2. 在 Cloudflare 正式 Worker 的 **Variables and Secrets** 中，将 Supabase 当前项目的 **service role key** 配置为 **Secret**，变量名 **`SUPABASE_SERVICE_ROLE_KEY`**。**不得**写入 GitHub 文件、浏览器环境变量或 `NEXT_PUBLIC_*` 中；不得在聊天、截图或 issue 中暴露密钥。
3. 确认 Cloudflare Worker 已重新发布且绑定了该 Secret。部署是否成功与密钥是否正确必须分别验证。
4. 由账号本人在「关于此账号 → 国家/地区隐私设置」自主选择允许公开，然后点击识别更新；网络出口 IP 归属地可能显示日本，不代表真实居住地。
5. 预期返回 `saved:true` 时显示写入成功；若仍返回 `saved:false`，检查是否正确绑定到 Worker 正式环境。若返回 503，检查数据库迁移、RLS、Secret 是否属于同一个 Supabase 项目。
6. 账号本人关闭公开后，其他人应该看到「未公开」。验证公开与非公开两种情况，确认不会误泄露 `country_code`。
7. 若用户不希望披露位置，可保留关闭公开；不应替用户自动开启，且无需为此增加收费 API。

## 代码约束

- 国家信息仅来自 Cloudflare 服务器端 `cf.country`；不信任客户端提交的国家代码或 IP。
- 只保存粗略的两位国家代码和更新时间；不保存原始 IP。
- 仅在当前已验证登录用户本人主动同意公开时更新。
- 使用服务器端管理员权限前已校验 Bearer token 的身份和隐私开关，并在数据库更新 `user_id` 与 `is_public=true` 时双重限制。
- 密钥缺失时返回仅预览，而不是冒充已保存。
- **本次 PR 只改善状态显示与测试，不包含密钥、数据库修改，也不会将预览虚报为公开状态。**

