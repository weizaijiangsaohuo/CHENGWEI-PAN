# Starflow IP 属地统一展示：实施与隐私验收

更新：2026-10-12。本功能处于**开发分支**。新增公开制度的数据库开关**默认关闭**；提交代码≠生产环境已强制展示。

## 展示规则

- 中国大陆访问：展示省级地区（如安徽）；境外网络出口：展示国家或地区（如日本）。
- 只使用 Cloudflare Worker 服务端读取的 `cf.country`、`cf.regionCode`；不得公开或储存用户的原始 IP、GPS、精确坐标或具体街道。
- 无有效记录、网络元数据异常或不活跃用户显示「未知」；不能伪造老账号历史定位。
- VPN / 代理 / 移动网络会影响属地。它反映的是网络出口大致位置，不代表真实居住地。
- 创始人 / 超级管理员可通过管理员控制台更正账户显示属地；必须填写10—500字审核理由，服务端审查角色并留痕。来源统一标记「平台人工更正」，不是系统检测。可以撤销后等待重新识别。
- 新制度在公告并正式启用后对所有活跃账号适用，不再依赖个人旧的公开开关；未正式启用前保留原来的选项。

## 技术说明

- `sf_ip_region_policy`：唯一开关 `enabled`，默认 false；RLS 限制公开数据读取。
- `sf_public_ip_region`：只储存 user_id、country_code、subdivision_code、source、updated_at；没有原始 IP 字段。
- `sf_record_auto_ip_region`：数据库只授予 service_role 执行权限；须结合服务器端 JWT 验证与 Cloudflare 元数据。
- `sf_admin_correct_ip_region` / `sf_admin_clear_ip_region_override`：创始人或超级管理员方可执行；审计写入 sf_admin_activity。
- `/api/account/ip-region`：必须从服务器可信地理信息生成，不接受客户端自报地区，且验证登录身份与同源请求。
- 登录客户端每12小时内最多尝试一次提交（单一 sessionStorage 会话内），避免对数据库产生过度负担。
- 公开属地对历史没有记录的用户可能先显示「未知」，待账号下次访问更新后显示；人工复核的记录要有明显标签。

## 上线前必须完成（目前尚未执行）

1. 修订、公布隐私政策与账号信息展示规则；发布全站公告，包含展示粒度、实施日期、纠错申诉途径，并完成法律和跨地域合规审查。
2. 在测试数据库应用新增迁移；检查默认 enabled=false、RLS 拒绝公共查询、无原始 IP 列、数据库审计不可由普通用户写入。
3. 将 `SUPABASE_SERVICE_ROLE_KEY` 作为 Cloudflare Worker **Secret** 安全配置，核查 Worker 和 Supabase 项目匹配。不得写在 GitHub、NEXT_PUBLIC_* 或聊天内容中。
4. 在测试环境启用 `UPDATE public.sf_ip_region_policy SET enabled=true,updated_at=now() WHERE id=true;`，演练 CN-AH、CN-GD、JP、未知场景与两名测试账号。
5. 验证浏览器刷新、手动更正与撤销、普通用户越权请求失败、已删除账号级联清除、完整 IP 不被返回、跨设备功能不受影响。
6. **公告生效后**，由正式环境数据库管理员打开政策开关；在 iPhone / Android / PC / Mac 实测，并核实 Cloudflare Worker 发布结果。

## 紧急回滚

由数据库管理员执行 `UPDATE public.sf_ip_region_policy SET enabled=false,updated_at=now() WHERE id=true;`，RLS 将阻止普通用户查看新表。再按事故处理流程处理可能的个人信息问题；页面隐藏不等于已删除存储数据。

## 参考

- [《互联网用户账号信息管理规定》](https://www.cac.gov.cn/2022-06/26/c_1657868775333429.htm)
- [Cloudflare Workers Request cf 属性说明](https://developers.cloudflare.com/workers/runtime-apis/request/)
