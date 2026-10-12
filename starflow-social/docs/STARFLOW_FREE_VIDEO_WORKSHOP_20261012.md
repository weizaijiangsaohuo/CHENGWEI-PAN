# Starflow Local Video Workshop — 免费浏览器视频工作台

> 研究 / MVP 实验性开发，尚未完成真实 iPhone Safari 全面验收；**没有部署到线上网站**，不具备生成式 AI 模型能力。

## 产品实现

路径：`/starflow-video-editor.html`，静态页面放在 `starflow-social/public/starflow-video-editor.html`；Starflow 的 AI Studio 已新增入口。

在手机 Safari 或其他支持的浏览器中，选择自己的图片 / 视频即可在本地处理：
- 图片动态成片（简单镜头推进、平移）、视频帧绘制；
- 裁剪（最多 60 秒）、静音导出、基本变速、文字字幕、暖色/黑白/电影滤镜、切换纵横比例；
- 画布预览与 PNG 截图；
- 使用浏览器 `Canvas.captureStream` + `MediaRecorder` 本地录制输出，尽可能选择 MP4，否则 WebM；
- 720P/1080P 输出目标；4K、60FPS、120FPS 是**实验性**设备依赖选项，浏览器可能不支持；不是模型原生生成，也无法保证所有设备都能稳定输出指定帧率；
- 没有模型推理费用，没有付费 API，也不调用后端上传视频。

### 注意事项

本方案只解决轻量视频创作，而不是：
- 文生视频 / 图生真实人物的 AI 模型；
- 视频参考动作复刻、保真换脸、音画联合生成；
- 原生 4K / 120FPS；
- 在 iPhone 上训练世界顶级大模型。

浏览器原生导出可能不保留音频，不保证 HEIC 解码、不支持所有 MOV 编码，不提供跨浏览器确定性输出。免费不等于所有设备上都能导出。素材在浏览器中处理，但初次加载网站仍需要网络连接。

### 测试与发布

1. 本 PR 的静态回归检查：`node --test tests/starflow-local-video-editor.test.mjs`。
2. 构建：`npm ci && npm run lint && npm run build`（需要有完整依赖、项目环境）。
3. 必须用真实 iPhone Safari 验收 5 秒图片动画、短 MP4 裁剪、截图、导出及失败回退；尤其测试 Safari 的 MediaRecorder + Canvas.captureStream 兼容性。
4. 将 4K / 120FPS 作为 beta 处理参数，不宣传为已实现的顶级 AI 视频生成。
5. 代码审查与移动端实测通过后才能合并主干、部署线上；**不修改收费 API 功能的启用配置**。

以上各项没有通过前，保持 Draft PR。
