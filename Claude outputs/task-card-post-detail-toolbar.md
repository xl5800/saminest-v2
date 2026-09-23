# 任务卡：帖子详情页操作区改版（固定底部工具栏 + 分享弹层 + 沉浸式头图）

对应 worktree：`C:\Users\32092\Documents\Codex\saminest-v2-post-detail-toolbar`，分支 `feat/post-detail-toolbar`（从最新 `origin/main` 切出）。

## 背景

`src/pages/post/post-detail-page.tsx` 现在的操作区（分享/收藏/举报）是内容里的一行图标，跟着页面滚动；"咨询"（`ContactSellerButton`）单独 fixed 在屏幕底部。这次要把三个操作（分享、咨询、收藏）合并成同一条固定在屏幕底部的工具栏，顺序固定为**分享 → 咨询 → 收藏**；"举报"不再单独展示，改成点击"分享"弹出的自定义弹层里的一个选项。同时要把头图改成沉浸式（占满屏幕上半部分、不留白，但不能压住系统状态栏的时间/电量图标）。这个页面适用于全部三个分类（租房/求租/二手）——但求租分类的帖子列表卡片是纯文字卡片（`post-list.tsx` 的 `variant="wanted"`），跟本卡无关，本卡只改帖子**详情页**，三个分类共用同一个 `PostDetailPage`，不需要按分类分支处理。

## 1. 固定底部工具栏：分享 / 咨询 / 收藏

- 去掉现在内容区里的 `<div className="flex items-center gap-6">...</div>`（分享/收藏/举报那一行图标）。
- 新的固定工具栏替换掉现有的 `data-testid="post-detail-contact-bar"` 容器，改成三个操作横排：分享（图标按钮）→ 咨询（`ContactSellerButton`，样式沿用现在的大按钮或改窄一点自己判断，占据中间主要宽度）→ 收藏（`FavoriteButton variant="icon"`）。整条工具栏本身的 fixed 定位、`env(safe-area-inset-bottom)` 适配、白底+顶部细边框这几条现有做法保留。
- `ContactSellerButton` 在作者查看自己帖子时返回 `null`——这时工具栏里只剩分享和收藏两个图标，不需要把整条工具栏隐藏（跟现在"整条 empty:hidden"的逻辑不一样了，因为现在栏里不会再是空的）。
- **调查一个 bug**：你截图反馈"咨询按钮有些帖子没有显示"。看了 `contact-seller-button.tsx`，它只有两种情况返回 `null`：`!isSuccess`（`usePostAuthorQuery` 还没成功）和 `authorId === userId`（作者看自己的帖子，这个是预期行为，不用管）。请查一下 `use-post-author-query.ts` 和它背后的查询，确认是不是某些帖子这个查询会一直失败/一直 pending 导致按钮永久不出现——如果找到根因，顺手修掉；如果排查后发现只是"作者看自己帖子"这种预期情况被 BARRY 误认为是 bug，完工报告里说明清楚，不用额外改代码。

## 2. 分享按钮 → 自定义弹层（复制链接 / 分享到微信 / 举报）

- 点击工具栏的"分享"图标，不再直接调 `Share.share()`，改成弹出一个自定义的底部弹层（bottom sheet 样式，参考这个仓库里其它弹层/action sheet 的做法，比如 `publish-action-sheet.tsx`），里面三个选项：
  - **复制链接**：把 `${PRODUCTION_ORIGIN}/post/${id}` 复制到剪贴板（`@capacitor/clipboard` 或浏览器 `navigator.clipboard.writeText`，两端都要能用），复制成功给一个轻量的反馈（比如短暂的 toast/文案，不需要引入新的 toast 库，参考仓库里已有的成功态提示写法）。
  - **分享到微信**：直接调用现有的 `handleShare()`（`@capacitor/share` 的 `Share.share()`），不接入微信开放平台 SDK——这一步只是把"系统原生分享面板"包在这个自定义选项背后，不是真的微信卡片分享。
  - **举报**：跳转 `/post/${id}/report`（现有路由，逻辑不用动）。
- 弹层本身只在点击"分享"图标时打开，跟收藏/咨询两个操作无关。

## 3. 沉浸式头图：占满上半屏、不留白、不遮挡状态栏

- 现在图片轮播是 `aspect-[4/3]`，紧跟在 `<main>` 顶部，没有专门处理状态栏遮挡问题。这次要让头图真正贴到屏幕最顶端（不留白边），但不能盖住系统状态栏的时间/信号/电量图标。
- 这大概率不是纯 CSS 能解决的：`index.html` 的 viewport meta 现在只有 `width=device-width, initial-scale=1.0`，没有 `viewport-fit=cover`；`capacitor.config.ts` 也没有配置 `@capacitor/status-bar` 插件。要做到"图片延伸到状态栏底下、但状态栏图标仍然清晰可见"，一般需要：
  1. `index.html` 加 `viewport-fit=cover`。
  2. 引入/配置 `@capacitor/status-bar`（如果还没装，先查一下 `package.json`），把状态栏设成 overlay 模式（`overlaysWebView: true`），并根据头图顶部区域的明暗给状态栏图标选深色或浅色（`Style.Dark`/`Style.Light`）——如果头图内容明暗不定没法固定选一种，退回到给头图顶部叠一层从黑到透明的渐变遮罩（跟很多图片类 App 的沉浸式头图做法一样），保证图标在任何图片上都看得清，这个退路你自己判断选哪种更简单可靠。
  3. iOS/Android 两端都要验证，因为状态栏样式是原生层面的配置，网页预览这一步测不出来。
- 没有图片的帖子（`data.images.length === 0`）现在整个轮播区块不渲染，这次不用改——沉浸式头图只影响"有图片"的情况。
- 现有的悬浮关闭按钮（左上角 X）位置/样式不用动，它已经用 `env(safe-area-inset-top)` 避开了状态栏区域。

## 4. 详细描述上方加小节标题

- `data.description` 那段文字现在直接渲染、没有任何标题。这次在它上方加一个小节标题，样式参考页面里已有的小节标题写法（比如活动详情页 `活动描述` 那个 `<h2 className="mb-1 text-sm font-semibold text-text">`），文案就叫"描述"。

## 明确不做的事

- 不接入微信开放平台 SDK，"分享到微信"只是调系统分享面板。
- 不新增数据库表/迁移——本卡不涉及任何数据库改动。
- 不改 `contact-seller-button.tsx` 的登录跳转/建会话逻辑本身（除非是在排查"有些帖子不显示"这个 bug 时发现的真实缺陷）。
- 不改求租分类专属的列表卡片（`post-list.tsx` 的 `variant="wanted"`），那是首页/分类页的列表卡片，跟这个详情页无关。
- 联系方式区块（`data.contactMethod`/`data.contactValue`）、发帖者 `PersonCard`、留言区（`CommentSection`）本卡不涉及，留言区的头像/长按举报是另一张任务卡。

## 验收标准

- 三个分类（租房/求租/二手）的帖子详情页都能看到固定在底部的工具栏，顺序是分享→咨询→收藏；作者查看自己发的帖子时工具栏只剩分享和收藏。
- 点击分享弹出自定义弹层，三个选项都能正常工作（复制链接可用、分享到微信能唤起系统分享面板、举报能跳到举报页）。
- 头图占满屏幕上半部分不留白，状态栏时间/电量图标在任何图片背景下都清晰可见（iOS/Android 真机或模拟器验证一遍，不能只看网页预览）。
- "咨询按钮有些帖子不显示"这个反馈已经排查清楚，要么修复了根因，要么在完工报告里说明这其实是预期行为（作者看自己的帖子）。
- "描述"这个小节标题正确显示在详细描述正文上方。
- 现有测试全部通过，新改动补充对应测试（尤其是分享弹层的三个选项、工具栏在作者/非作者视角下的渲染差异）。
