# Starflow AI 第三批更新：头像与主页封面上传

## 交付内容

本批是现有 Next.js / Supabase 网站的增量功能包。**保留已有粉紫主题、发帖、评论、通知、投票、视频、认证及上一批个人主页标签和关注统计模块。**

- 在「设置 → 编辑资料」表单下方新增头像和主页封面管理组件。
- 头像：支持选择照片、自动缩放/转 JPEG，上传成功后写入现有 `public.profiles.avatar_url`；支持恢复默认头像。
- 封面：支持选择照片，存储至现有公开 `post-media` 存储桶的 `<account-uid>/covers/` 路径。个人主页从 Supabase Storage 读取最新封面；不创建新数据库列。
- iPhone 照片：支持由浏览器能解码的 HEIC / HEIF 转 JPEG；浏览器不能解码时会提示用户先转换照片。
- 尺寸限制：原图不超过 20 MB，缩放/压缩为不超过 5 MB 的 JPEG 再上传。头像最长边 720 像素，封面最长边 1800 像素；重新编码可去掉原照片 EXIF 元数据。
- 图片通过当前登录用户的 Supabase 会话上传，使用原有文件存储 RLS（路径第一级为当前用户 UID）；他人的头像/封面在本模块中不能被修改。
- 修改头像/封面后，返回个人主页或刷新页面会重新读取。
- 不改变原有账号、帖子、关注关系、角色、AI 服务、媒体或存储安全策略。不删除现有图片。

## 本 ZIP 中的文件

1. `starflow-social/components/StarflowProfileMedia.tsx`：浏览器端图片上传、头像更新、封面加载。
2. `starflow-social/app/profile-media.css`：手机/电脑端组件和封面图片样式。
3. `starflow-social/app/layout.tsx`：保留已有 Discovery 和 ProfileEnhancements 挂载，新增本模块及样式。
4. `starflow-social/STARFLOW_PROFILE_MEDIA_20261011_RELEASE_NOTES.md`：本说明。

仓库根目录上传为 **`starflow-release.zip`**，替换旧文件，提交到 `main`。现有 `.github/workflows/starflow-zip-auto-update.yml` 会执行 ZIP 安全校验、源码应用、TypeScript 检查和构建。不得把整个 ZIP 解压后逐个手动覆盖。

## 验收步骤

1. 登录 → 设置 → 在原来的姓名/用户名/简介编辑表单下方找到「头像与主页封面」。
2. 上传 JPG/PNG/HEIC 照片作为头像，确认出现成功提示；返回个人主页，确认头像显示。刷新后应继续存在。
3. 上传封面，返回个人主页核对图片和比例；刷新页面后依然显示。
4. 验证已有「动态/回复/媒体」和关注/粉丝统计、帖子发布、评论、通知、投票、AI 客服没有回归故障。
5. 其他登录账号查看这个用户的个人主页，核对头像、封面可见。
6. Safari/Chrome 在 iPhone 上检查是否有水平溢出、封面错误裁切或控件遮挡。

## 已知限制

- 依赖站点已经正确配置原有 `post-media` 存储桶及其读写权限；若出现 Storage 错误，应查看提示并核对 Supabase 配置，不要清空数据库。
- 本批仅是个人媒体编辑功能，不代表此前提出的 24 章需求全部完成。网站、地区、屏蔽、静音、私密点赞列表、完整评论线程和搜索体验仍需分批完善。
- 原有 `post-media` 的文件大小和 MIME 限制不变，HEIC 处理依赖浏览器本身能够解码；已压缩的 JPEG 才发送到 Supabase。
- 为避免改变生产数据库结构，封面以 Storage 目录下**最新创建的文件**为准（读取最近最多 50 个对象），当前无「恢复默认封面」按钮，也不会自动删除旧封面图片。
- 当前 CSS、TSX 语法和 ZIP 结构已完成离线检查。**完整 npm 构建、在线实际上传及跨设备联调需要 GitHub Actions / 生产站点测试。**

## 回滚

若新 UI 产生问题，将 `app/layout.tsx` 恢复至上一版（保留已有 `StarflowDiscovery` 和 `StarflowProfileEnhancements`），不再挂载 `StarflowProfileMedia` 与 `profile-media.css`。无数据库迁移，无需回滚数据。
