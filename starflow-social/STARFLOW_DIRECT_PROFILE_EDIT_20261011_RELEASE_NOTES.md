# Starflow AI 个人主页快捷更换头像/封面 · 修正包

## 为什么修正

此前的上传入口只存在于设置页「保存资料」下面，在 iPhone 上必须长距离滚动才可以修改图片，不符合社交平台的基本交互预期。

## 修正后的交互

- 登录账号进入**自己的个人主页**，直接轻点头像上的相机图标选照片、更换头像；无需去设置。
- 直接点击封面区域，或者底部右侧「更换封面」入口，选照片替换背景。
- 仅当访问资料页的 ID 与当前登录 Supabase 用户 ID 相同时显示相机入口。访问其他用户主页不显示编辑入口。
- 上传期间明确显示进度/错误提示，成功后自动刷新个人主页，以同步主信息流、头像和封面展示。
- 继续复用旧版受 RLS 保护的 post-media 存储和 profiles.avatar_url；支持受限的 JPG/PNG/WebP/HEIC 图片转换为 JPEG，20 MB 输入上限、5 MB 输出上限。
- 保留设置页原有图片管理作为备用入口；不修改发帖、关注、评论、认证、AI 服务和数据库结构。

## ZIP 文件列表

1. `starflow-social/components/StarflowProfileMedia.tsx`（更新原模块，复用上传处理）
2. `starflow-social/app/profile-media.css`（头像/封面的直达触控热区和相机标记）
3. `starflow-social/STARFLOW_DIRECT_PROFILE_EDIT_20261011_RELEASE_NOTES.md`（本说明）

**不包含** layout.tsx，因为布局入口在第三批已引用 StarflowProfileMedia 和 profile-media.css；保留其原有引用，避免覆盖未来的其他功能。

## 必须实测

1. 自己的个人主页应该出现封面右下角「更换封面」和头像相机图标；点封面任何位置可打开相册。
2. 上传头像/封面并等待页面自动刷新后，重新访问仍然展示所选图片。
3. 在其他人的主页不应该出现编辑图标。
4. 手机上的底部导航、编辑资料、帖子和其它功能不受影响。
5. 上传异常请截图提示文本排查。仅离线检查通过时，不应宣称 GitHub/Cloudflare 部署或在线上传成功。
