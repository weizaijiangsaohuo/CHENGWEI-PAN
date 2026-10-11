# Starflow 账号详情与近似国家/地区

## 数据源与交互

- 个人主页昵称、金色/蓝色/灰色徽章和加入日期均可打开 `/profile/{handle}/about`。**不修改已有金色徽章的 SVG 轮廓及颜色**。附属组织小头像仍跳转组织个人主页。
- 详情只从真实 `profiles`、`account_verifications`、`organization_affiliations`、`account_handle_changes` 及 `account_ip_country` 读取。未记录的历史数据明确为不可追溯。
- 近似位置完全独立于 GPS；用户在详情页主动选择公开后，才可点击按钮触发一次 Cloudflare 最近访问 IP 的**国家级代码**提取。不采集也不保存原始 IP。关闭后公众无法读取此信息。
- IP 国家不是真实居住地或 GPS 坐标；VPN/代理/旅行造成误差。没有国家信息时不得猜测。

## 上线要求

1. Supabase 迁移 `supabase/migrations/20261011_account_about_country.sql` 必须先执行，否则账号详情的位置/用户名统计查询会失败。
2. Cloudflare Worker 必须配置名为 `SUPABASE_SERVICE_ROLE_KEY` 的服务器机密，且**不能**在 `NEXT_PUBLIC_*` 公开变量中暴露。只有服务器端读取。对于尚未配置的 Worker，位置更新按钮会显示“服务尚未启用”，不会写入假数据。
3. `getCloudflareContext().cf.country` 是可信的服务器侧请求国家代码；不能接受客户端输入的国家/地区值。
4. `npm run lint` + `npm run build`；再通过 iPhone 测试昵称、徽章、附属头像三条互不混淆的导航路径。
5. 上线后触发「更新位置」并核对隐私关闭后不可公开读取。用户名计数从本次迁移后开始。

本版本没有实现 24 小时后台跟踪、精确 GPS、过去未记录的改名历史或客户端来源历史。不宣称这些能力已经具备。
