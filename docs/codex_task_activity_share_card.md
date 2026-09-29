# 任务卡：找搭子活动详情页分享卡片（动态生成 OG 预览图）

## 背景

帖子详情页（`/post/:id`）已经有 `middleware.ts` 做 Edge Middleware 层面的
OG 标签注入，用帖子的真实图片当 `og:image`，效果是分享到微信等平台时能
看到标题、简介和一张真实图片的预览卡片。

找搭子活动详情页（`/activities/:id`）完全没有这套东西——分享出去只能拿到
`index.html` 默认的 `<title>Saminest</title>`，没有任何预览图和描述，
点击率很差。而且活动大多数没有配图，不能直接照搬"用第一张图片当
`og:image`"这条思路。

之前设计过一版专门给活动分享用的品牌化卡片视觉（1200×630，蓝色渐变背景
+ 频道 tag + 标题 + 时间/地点/人数进度），原型是两个静态 HTML 文件：
`og-card.html`（卡片本身，1200×630）和 `wechat-preview.html`（演示这张
图在微信聊天气泡里的实际展示效果，帮助确认版式在小尺寸缩略图下依然可读）。
这次要把这版视觉做成"根据每个活动的真实数据动态生成"的图片，不是一张
所有活动共用的静态图。

## 要求

1. **依赖**：新增 `@vercel/og`（基于 Satori 的 JSX→PNG 渲染库，专为
   Vercel Edge Function 设计；`@vercel/functions` 已经在用，是同一个
   生态，装起来不会有冲突）。

2. **新建一个 Vercel Edge Function**，建议路径 `api/og/activity.ts`
   （仓库目前没有 `api/` 目录；`vercel.json` 里的 rewrite 规则
   `"source": "/((?!api/).*)"` 已经把 `api/` 排除在 SPA 兜底规则之外，
   不需要改 `vercel.json`）。
   - 入参：活动 id（query string，如 `?id=xxx`）。
   - 查询 Supabase 用 anon key 走 REST API（`fetch` 直接打 REST 接口，
     参照 `middleware.ts` 里现成的写法），**不要** import
     `src/integrations/supabase/client.ts`——原因跟 `middleware.ts`
     顶部注释一致：那条模块链路会拉到 Vite 专属的 `import.meta.env`，
     Edge Function 的打包环境不过 Vite，这条 import 在构建期就会失败。
   - 查询字段：`channel, tag_text, title, start_at, is_online, capacity,
     participant_count, status, location:location_id(name), landmark_text`。
   - 用 Satori JSX 还原 `og-card.html` 的视觉（1200×630，径向渐变蓝色
     背景，左上角频道 tag 胶囊，标题最多两行，底部两行 meta：时间 +
     地点/人数）。具体文案规则：
     - 频道 tag：复用 `ACTIVITY_CHANNEL_OPTIONS`（
       `src/repositories/activities-repository.ts`）里的 emoji +
       label，不要在新文件里重新维护一份频道文案。
     - 时间行：`start_at` 按活动详情页/列表页现有的时间格式化函数处理成
       "M月D日 周X HH:mm"这类展示形式，照抄现有逻辑，不要另起一套格式。
     - 地点/人数行：线上活动显示"线上活动"；线下按现有详情页用的字段
       （`location.name` 或 `landmark_text`，看 `activity-detail-page.tsx`
       实际用的是哪个）拼地点，人数状态沿用 `activity-detail-page.tsx`
       / `activity-card.tsx` 里已有的"还差 N 人（M/容量）"/"已满员"算法，
       不要重新写一套措辞不一致的版本。
   - 已结束（`status = 'ended'`）/已取消/查不到（不存在、被软删除、被
     RLS 挡掉）的活动：返回一张不带具体活动信息的通用品牌兜底图（纯
     Saminest 品牌背景 + "找搭子"字样），不要返回 500，也不要把内部
     错误信息画到图上。

3. **中文字体**：Satori 不自带任何字体，默认情况下中文会渲染成方块或者
   直接丢字、留白。必须显式加载一个支持中文的字体文件（例如 Noto Sans
   SC 的某个静态字重子集），读成 `ArrayBuffer` 传给 `ImageResponse` 的
   `fonts` 选项。**生成图片前必须实际跑一次、肉眼确认中文正确渲染**——
   这是这个任务里唯一一个"代码逻辑看起来对、但实际跑起来可能不对"的坑：
   Satori 字体没配对时不会报错，只会安静地生成一张有方块或空白的图。
   字体文件放在仓库哪个位置、用哪个具体字重，你按现有资源自行决定（可以
   从 Google Fonts 下载一份放进仓库，比如放在 `api/og/fonts/` 下），并在
   完成后的回复里说明放在哪、多大。

4. **扩展 `middleware.ts`**（不要新开一个中间件文件——Vercel 每个项目
   只认一个 `middleware.ts`）：
   - `config.matcher` 从单一字符串改成数组，加上 `"/activities/:id"`
     （注意复数 `activities`，跟 `src/router/routes.tsx` 里
     `path: "activities/:id"` 保持一致；不要写成单数 `/activity/:id`，
     也注意别命中 `/activities/:id/report`、`/activities/:id/notify`
     这两个子路径——精确匹配单层路径段，跟现有 `/post/:id` 的写法一样）。
   - 中间件函数内部按路径分支：`/post/:id` 走原有逻辑完全不变；
     `/activities/:id` 新增一支，查 `activities` 表（字段同第 2 步），
     拼：
     - `og:title` = 活动标题
     - `og:description` = 频道 + 时间 + 地点/人数拼成的一行文字（跟卡片
       图片上的信息一致即可，不需要一字不差）
     - `og:image` = 指向第 2 步新建的 `/api/og/activity?id=xxx`，注意
       要拼成绝对 URL（参照原文件里怎么用 `request.url` 拼 `og:url`）。
   - 查不到活动（不存在/被软删除/被 RLS 挡掉）时：跟现有帖子逻辑一致，
     `return next()`，走正常 SPA 流程，不强行插入 OG 标签。

5. **验证**：
   - 部署到 Vercel Preview 后，直接访问
     `/api/og/activity?id=<真实活动id>`，确认返回一张 1200×630 的 PNG，
     肉眼检查中文字体、频道 emoji、时间、地点/人数文案是否正确，跟
     `wechat-preview.html` 展示的缩略效果比对一下版式是否依然可读。
   - 用 https://www.opengraph.xyz 之类的 OG 标签检测工具，输入一个真实
     活动详情页 URL，确认抓到的 `og:title`/`og:description`/`og:image`
     都正确。
   - 微信的真实分享效果因为有链接预览缓存，本地/Preview 阶段不一定能
     立刻看到；不强求这一步在这次任务里验证到位，但要在回复里说明"微信
     侧因缓存未实测，建议线上发布后找一个真实活动链接在微信里发一次确认"。
   - 跑 `npm run typecheck && npm test`，确认现有测试全部通过；如果
     `middleware.ts` 目前没有专门的单测，新增的活动分支不强制要求补测试
     基础设施，但至少要在回复里说明现状。

6. 不自动提交或推送。完成后按老规矩回复：改了什么、生成图片的实际效果
   （文字描述即可，不需要真的贴图）、验证结果、剩余风险（尤其是字体
   文件大小对 Edge Function 冷启动/打包体积有没有明显影响，如果有要
   提一句）。

## 参考文件

- `middleware.ts`（现有帖子 OG 注入实现，新逻辑照这个模式扩展）
- `docs/share-card-design/og-card.html`（分享卡片视觉设计稿，1200×630，
  同目录 `og-card-preview.png` 是渲染出来的效果图）
- `docs/share-card-design/wechat-preview.html`（该卡片在微信聊天气泡里
  的展示效果预览，同目录 `wechat-preview-small.png` 是渲染出来的效果图）
- `src/repositories/activities-repository.ts`（`ACTIVITY_CHANNEL_OPTIONS`、
  活动数据结构）
- `src/pages/activities/activity-detail-page.tsx` /
  `src/components/activity-card.tsx`（时间格式化、"还差 N 人/已满员"
  文案的现有实现，照抄逻辑，不要重新发明）
- `vercel.json`（`api/` 路径已经排除在 SPA rewrite 之外，不需要改）

## 备注

- 这是纯增量功能，不改动任何现有页面的运行时逻辑，风险主要在 Edge
  Function 本身的字体/渲染细节，不涉及数据库结构或权限变更。
- 帖子详情页的 `og:image` 现状是"直接用真实帖子图片"，这次任务**不要**
  顺手把它也换成生成图——帖子有真实图片，这是产品设计文档里就定好的
  现状，属于任务范围之外的改动。
- 严格遵守 CLAUDE.md / `docs/04_Development/AI-Development.md` 的既有
  规则：不自动 commit/push，不擅自扩大任务范围。
