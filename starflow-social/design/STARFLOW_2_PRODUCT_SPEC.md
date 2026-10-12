# Starflow 2.0 — Nebula Glass 产品、Figma 与交付规范

版本：2026-10-12（首批开发执行版）。产品定位：X 风格高效率社交信息架构 + Starflow 图片发现特色 + 精简克制的网页玻璃导航。本文只列实际开发状态；设计规范与验收目标不代表已上线或设备已实测。

## 1. 现有平台审计

- GitHub 前端同时引入 globals.css、liquid-glass.css、starflow-x.css、starflow-reference-v2.css 等历史样式，覆盖冲突让颜色和视觉层级不可预测；最新 starflow-2.css 加载在最后，逐步统一后再清理旧样式。
- 推荐与关注曾共用两列图片瀑布流；实际关注关系和标准帖子卡已经存在。这次重构让推荐保留图片发现，而关注显示独立单列时间线。
- 移动侧滑菜单、底部导航、私信与管理后台已有真实路由。下一步统一导航材质与状态，不增加空白入口。
- iOS 录屏用于比对首屏载入、顶部/底部布局；性能需要后续真实硬件测量。不可凭录屏宣称已达到 60fps。
- X 官方时间线体验文档：https://help.x.com/en/using-x/x-timeline
- Apple 材质指导：https://developer.apple.com/design/human-interface-guidelines/materials

## 2. 站点信息架构

| 模块 | 路由 / 入口 | 信息架构和服务端操作 |
| --- | --- | --- |
| 首页·推荐 | / → 推荐 | 图片/视频发现、打开帖子、真实点赞收藏、创作入口 |
| 首页·关注 | / → 关注 | 真实关注关系 + 本人信息流；单列时间线、空态、骨架屏 |
| 搜索发现 | /explore | 搜用户/帖子、已有筛选结果、真实跳转 |
| 帖子详情 | /post/[id] | 全帖、回复、点赞、转发、收藏、举报、媒体预览 |
| 个人主页 | /profile/[handle] | 资料/封面/认证、关注关系、动态分类、私信 |
| 私信 | /messages | 双栏桌面/独立移动会话、录音、转写、位置、通话 |
| 通知 | /notifications | 互动、系统、安全、认证通知与真实详情 |
| 设置 | /settings | 账号、隐私、安全、外观、帮助；真实可写设置 |
| 认证 | /verification | 蓝/金/灰认证状态与真实申请 |
| 管理 | /admin/console | 权限表、内容审核、公告、可审计操作 |

## 3. Figma 文件结构与帧清单（已创建，可编辑）

**设计文件：** https://www.figma.com/design/I4LzIPERJmtZtQMORfietK 。包含基础设计、组件以及八个移动页面和三个桌面页面；已有八段原型点击转场。现有设计是可编辑初版，不表示以下所有规划帧和组件状态已经逐个交付。

- Design Tokens 页面：Color/Light、Color/Dark、Typography、Spacing、Radius、Elevation、Motion、Glass/Levels。值见 design/starflow-2.tokens.json。
- Components 页面：Glass/Navigation、Glass/Segmented、Glass/Button、Glass/Sheet、Feed/Post、Feed/Composer、Profile/Header、Trust/Badge、DM/Bubble、DM/Voice、DM/Location、DM/Call、Notification/Row、Admin/Table、Admin/Toolbar。
- Mobile iPhone 390×844：Home-Recommend、Home-Following、Post、Profile、Explore、Notification、DM-List、DM-Thread、Voice-Recorder、Voice-Call、Location-Share、Settings、Verification、Admin-Overview。
- Android 412×915：同名可复用 Frame；保证至少 44–48px 触控。
- Tablet 768×1024：折叠侧导航、内容区最大约 624px。
- Desktop 1440×900：左栏约 244px、中心 624px、右栏 260–330px；私信双栏；后台响应式数据表。
- 所有核心页面分 theme=light/dark、state=default/pressed/focus/disabled/loading/error/empty/success；与源代码真实路由相互链接，拒绝只有漂亮静态图却无法点击的原型。
- Figma 已连接，文件已创建。Starter 套餐仅允许 3 个页面且单个变量集合不支持 Light/Dark 双模式，因此基础、组件、页面合并组织在三个分区；明暗颜色变量分为两个集合。

## 4. 基础设计规则

- 内容正文不加 backdrop-filter；玻璃只属于导航、浮动按钮、选择控件、顶部工具栏、弹窗与抽屉。
- 主色 #7549BD，暗色强调 #AD8BE2；文本浅色 #1D1B24、深色 #F4F2F8；背景 #FFF/#0E0D13。
- 字号 caption 12px、secondary 13px、body 15px、subtitle 18px、title 22px、display 28px；正文行高 1.55–1.65。
- 间距 4/8/12/16/20/24/32/40/48px；圆角 8/12/16/20/24px；胶囊 999px。
- G1 导航 18px blur、132% saturation；G2 浮层 22px blur、145% saturation；G3 重点高光/弹性选中层用在少量组件。
- Motion Fast 140ms、Normal 220ms、Navigation 320ms，cubic-bezier(.2,.8,.2,1)，优先 transform/opacity；支持 prefers-reduced-motion、reduced-transparency、contrast。
- 网页模拟材料并不等同于 Apple 原生 Liquid Glass 光学折射。谨慎叠加模糊，降级为实体背景时必须能读清内容。

## 5. 页面及动效合同

**首页**：推荐图片卡信息重点在媒体与标题；关注单列真实帖子，包括评论、转发、点赞、收藏。切换时同步 aria-pressed、视觉选中态，关注内容为空则提供真实引导，不编造帖子。滚动加载使用占位 Skeleton 并优化列表可见性。

**帖子详情**：阅读区不超过 624px；图像查看可退出、操作按钮至少 42px；点赞收藏乐观反馈必须处理失败回滚；键盘打开不能挡回复栏。

**个人主页与认证**：头像封面安全布局、蓝金灰 badge 来自后台审核；真实账号数据而非硬编码计数；允许键盘与读屏浏览。

**搜索和通知**：使用现有真实数据源，类别筛选有效，搜索响应空态/失败态；未读、系统、互动、认证类型视觉层级清晰。

**私信**：内容实体、工具栏轻玻璃；语音/位置只在主动授权后发送；语音转写只填写输入框；音频保持私有；未配置 TURN 的通话不能保证所有网络接通，也不能假装后台系统推送已实现。移动键盘安全区与最后一条消息可见性必须实测。

**设置**：浅色、深色、自动模式本地持久化并响应操作系统主题变更；减少动画、紧凑布局操作可恢复；安全敏感操作仍由服务端校验。

**管理后台**：数据表、审核正文实体清晰；仅导航和弹窗玻璃化；每个危险操作必须经过服务端 RBAC 和审计；不得将私人 DM 内容曝光给运营角色。

## 6. 真实验收脚本

| 用例 | 操作 | 通过条件 |
| --- | --- | --- |
| 首页 | 推荐→关注→推荐 | 两种布局确实不同，关注只读取关注关系，空态与骨架屏正确 |
| 互动 | 发帖→点赞→收藏→取消 | 真实状态保存，即时反馈，失败能够恢复 |
| 搜索 | 用户或内容搜索→筛选 | 没有空白按钮或假热点 |
| 消息 | A 录音→发送→B 播放 | 仅会话双方有存储读取权限，iPhone/Android 可实测播放 |
| 识别 | 授权麦克风→转写→编辑→发送 | 识别不自动发送，授权前不会采集音频 |
| 位置 | 授权→发送一条位置→打开地图 | 不持续追踪，不私自请求定位 |
| 通话 | 两台不同网络设备拨号→接听→挂断 | 声音双向、失败提示、TURN 状态准确 |
| 认证 | 申请→管理员审核→徽章状态更新 | 真实蓝金灰类型与审核状态保持一致 |
| 后台 | 创始人操作→普通用户尝试 | 操作有审计，非管理员被拒绝 |
| 主题 | 浅色→深色→自动→刷新 | 主题本机持久化，不丢失内容与焦点 |
| 可访问性 | VoiceOver/TalkBack、键盘、减少动画 | 控件有标签、焦点可见、动画可降级 |

## 7. 设备与性能目标（不是现有测试数据）

- 目标：LCP ≤2.5秒、INP ≤200ms、CLS ≤0.1（记录网络和机型、不可凭空声称达成）。
- 移动端滚动/动画目标 60fps，高刷设备在浏览器允许时适配 90/120Hz。只使用 CSS transform/opacity 作主动画，大模糊层同时最多 2 层。
- 对 iPhone Safari、Android Chrome、Windows Chrome/Edge、macOS Safari/Chrome，分别进行 390/412/768/1440px 截图回归、功能路径测试、Web Vitals 和滚动帧率记录。
- 骨架屏代替无限 spinner、媒体懒加载、屏幕可见区渲染；虚拟列表必须与读屏/浏览器返回兼容后才能启用。

## 8. 交付状态与后续工作

- 完成：现状审计、IA/PRD、Design Tokens、组件命名与 Figma 帧规划、开发契约、验收矩阵。
- 本 PR 完成的开发：真实推荐/关注布局分离、轻重材质分级、玻璃底部导航选中层、主题切换、内容优先 CSS、可访问组件基础。
- 已完成：Figma 在线可编辑文件、部分可点击原型、第一轮移动/桌面高层设计。
- 待完成：其余规划帧与全部状态变体、高保真逐页交互、历史 CSS 清理、Cloudflare 最新部署核实、跨设备实测、视频通话/通知推送/文件发送的完整端到端功能闭环和性能预算验收。
