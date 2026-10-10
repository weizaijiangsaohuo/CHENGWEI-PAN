# Starflow AI · 波纹认证徽章与官方通知改造

- 独立粉紫品牌，不复制 X 标志或暗示 X 授权。
- 认证徽章改为平滑八瓣波纹印章 + 高对比度白色对勾；三色均只接受服务器读出的已批准记录。
- 通知页包含「全部」「未读」「提及」「系统」：关注、点赞、转发、回复等来自 `notifications` 真实记录；认证通过/拒绝/撤销，账号安全警告、违规处理、恢复，展示系统正文，不再显示为“某用户与你互动”。
- 使用已有 Supabase 触发器：`notify_follow`、`notify_like`、`notify_repost`、`notify_reply`、`sf_verification_status_notification`、`sf_verification_revoke_notification`、`sf_moderation_decision_notification`。不重复创建触发器，不修改数据库结构。
- **违规判定必须先由明确的审核/处罚事件产生**，只有审核决定落库后，平台自动生成通知；本包没有自行推断、训练或部署违规自动识别模型。
- 通知中心打开时约每 30 秒刷新且切回页面时刷新；不是 iOS 系统推送，不声称后台推送权限。
- 保留原有搜索、帖子分享、设置、AI 客服、无私信、资料编辑和账号删除组件。
- 注意这批页面只改善通知呈现；不是完整管理员审核工具，不自动生成模拟互动通知。
- 更新路径：ZIP 根目录必须包含 `starflow-social/`，上传为仓库根目录准确文件名 `starflow-release.zip`。
- 验收：徽章三色在任意帖子/资料、认证信息弹层；通知页四标签、读/未读、分享跳转；认证系统消息正文；iPhone 页面检查；GitHub TypeScript 和 Next.js 构建。
