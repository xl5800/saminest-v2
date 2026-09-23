# 任务卡：背景换中性浅灰 + 卡片边框/阴影撑出层次 + 全站 bg-white→bg-card token 统一

## 对应 worktree
路径：`../saminest-v2-bg-depth`
分支：`feat/background-depth-and-token-cleanup`（从 `origin/main` 切出）

## 背景

BARRY 反馈"软件背景色太白了，想要 Airbnb 那种感觉"。查了一下现在的
token：`src/index.css` 里 `--color-bg` 是 `#F3F5FA`，一个偏冷的浅蓝灰，
跟卡片的纯白 `#FFFFFF`（`--color-card`）亮度差只有约 4%，屏幕上基本看
不出区别，这是"感觉太白"的直接原因。

做了个对比页给 BARRY 看了 4 个候选背景色（配上实际的卡片样式），他选定：

1. **背景换成中性浅灰 `#F5F5F5`**（不偏冷不偏暖，比现状去掉蓝色调）。
2. **同时要卡片用"细边框+阴影"撑出层次感**——这是因为查完发现，真正让
   页面"看起来不那么白"的，光换背景色本身效果有限（新旧两个颜色亮度其实
   很接近，主要是去掉了蓝色调），卡片本身有没有清晰的边界（边框+投影）
   才是撑出"背景 vs. 卡片"层次感的关键。现在站内大部分卡片列表项
   （`activity-card.tsx`/`my-posts-page.tsx`/`my-activities-page.tsx`/
   `favorites-page.tsx`）已经是`rounded-2xl border border-border bg-white
   shadow-card`这套组合，**唯独`post-list.tsx`（首页/分类页的主力信息流，
   全站曝光最高的卡片）完全没有边框也没有投影**（`block overflow-hidden
   rounded-2xl bg-card`），这次一并补齐，让最常见的卡片也用上同一套边框
   +投影语言。
3. **顺便把之前 UI 审计发现的 P1 问题——全站 `bg-white`/`bg-card` 这两个
   class 混用一并统一**：`--color-card` 的值本来就是 `#FFFFFF`，跟
   `bg-white` 渲染结果完全一样，纯粹是历史遗留下来的两种写法没统一，这次
   全部改成语义化的 `bg-card`（表达"这是一张卡片/一个白色表面"，不是
   "这个颜色恰好是白色"）。

## 每个文件的要求

### 1. `src/index.css`

`--color-bg` 从 `#f3f5fa` 改成 `#f5f5f5`。更新这一行上方的注释，说明这次
改动的原因（背景太白、跟 BARRY 确认过换成中性浅灰），不需要保留旧值
`#f3f5fa` 相关的历史注释（那是 Meet5 风格改版留下的，这次是新一轮独立
的调整）。

**不改 `--color-card`**（保持 `#ffffff` 不变，卡片本身还是纯白，层次感
靠背景变灰 + 卡片边框/投影两件事一起撑出来，不是把卡片也调灰）。

### 2. `src/features/posts/post-list.tsx`

`grid` variant 的卡片容器（现在的 `block overflow-hidden rounded-2xl
bg-card`）补上 `border border-border shadow-card`，跟站内其它卡片列表项
统一成同一套"边框+投影"语言。`wanted` variant 的文字卡片（现在的
`block rounded-2xl bg-card p-4 shadow-card`，已经有投影但没有边框）补上
`border border-border`，同样是为了跟其它卡片保持一致。

这两处都只是加 class，不改布局、间距、图片比例等其它任何东西——
`post-list.test.tsx` 现有的 33 条测试如果因为纯 class 变化就断言失败，
说明测试断言了具体的 className 字符串，按需更新那部分断言即可，不代表
出了其它问题。

### 3. 全站 `bg-white` → `bg-card`

下面是核查过的当前所有 `bg-white` 出现位置（生产代码，不含 `*.test.*`
文件），逐一确认过都是"这里就是想要卡片/白色表面这个语义"，不是恰好用
到白色这个具体颜色值的特殊场景，**全部**替换成 `bg-card`：

- `src/components/activity-card.tsx:70`
- `src/components/comment-item.tsx:102`（文档注释里的文字，一并改成
  "bg-card"）、`:553`
- `src/components/person-card.tsx:33`
- `src/pages/post/post-detail-page.tsx:427`
- `src/pages/admin/users-page.tsx:233`
- `src/pages/admin/all-posts-page.tsx:196`
- `src/pages/admin/pending-posts-page.tsx:156`
- `src/pages/admin/reports-page.tsx:388`
- `src/pages/admin/categories-page.tsx:265`、`:390`
- `src/pages/admin/feedback-page.tsx:156`
- `src/pages/profile/edit-profile-page.tsx:173`
- `src/pages/profile/blocked-users-page.tsx:50`
- `src/pages/profile/profile-page.tsx:71`、`:237`
- `src/pages/feedback/submit-feedback-page.tsx:225`、`:241`
- `src/pages/report/report-activity-page.tsx:87`、`:101`
- `src/pages/report/report-user-page.tsx:115`、`:130`、`:144`
- `src/pages/report/report-post-page.tsx:84`、`:98`
- `src/pages/my-activities/my-activities-page.tsx:75`、`:622`
- `src/pages/settings/delete-account-page.tsx:138`、`:169`
- `src/pages/settings/settings-page.tsx:29`
- `src/pages/activities/activity-notify-page.tsx:103`
- `src/pages/my-posts/my-posts-page.tsx:266`、`:365`
- `src/pages/messages/conversation-page.tsx:78`、`:119`、`:295`（文档
  注释）、`:473`、`:521`、`:635`、`:681`、`:693`
- `src/pages/favorites/favorites-page.tsx:32`（文档注释）、`:97`

**这份清单是核查时的快照，不保证覆盖这次任务开工时的每一处**（可能有其它
并行任务卡这期间也在改同一批文件）——改完之后自己再跑一遍
`grep -rn "bg-white" src --include="*.tsx"`（排除 `*.test.*`），确认
生产代码里已经清零，清单之外如果还发现新的，一并改掉，不要漏网。

`*.test.*` 文件如果有断言具体 class 字符串包含 `bg-white` 的，同步改成
`bg-card`；如果只是测试文本里出现"white"这种描述性英文词（不是在断言
Tailwind class），不用动。

## 明确不做的事

- **不改 `--color-card` 的值**——卡片还是纯白 `#FFFFFF`，这次只改背景
  和卡片之间的层次表达方式（背景变灰 + 卡片加边框投影），不是把整体
  调成另一套配色。
- **不新建深色模式（dark mode）支持**——这个 App 目前没有深色模式系统，
  这次改动的 token 只影响浅色模式下的观感，不在这次任务范围内额外做
  深色适配。
- **不逐个走查 `bg-bg`（由 `--color-bg` 驱动的另一个 class）的每一处
  使用场景是否"看起来还合理"**——`bg-bg` 在全站有 70+ 处使用（头像兜底
  圆圈、状态徽章、输入框背景、hover 反馈、引用块等），全部都是"中性浅灰
  表面"这同一个语义，`#F3F5FA` 改成 `#F5F5F5` 是同一个 token 的全局
  统一调整，不是要挑着改某些地方——不需要为这次调整逐个截图核对每一处
  用法，除非跑测试/构建时发现具体报错。
- **不处理审计报告里其它 P1/P2 条目**（重复的确认删除弹窗、两个新操作
  面板 emoji/lucide 图标混用、搜索栏 JSX 重复、`focus-visible` 焦点态
  缺失、孤儿 `Fab` 组件等）——这些不在这次任务范围内，以后按需单独开卡。
- **不改动 `FavoriteButton`/`app-shell.tsx` 相关逻辑**——跟这次任务无关。

## 验证要求

- 视觉核实：至少截图/肉眼确认首页信息流（`post-list.tsx` grid
  variant）现在能看出"背景灰、卡片白+细边框+投影"这个层次，不是之前那种
  背景卡片糊在一起看不出边界的样子。如果撞上这个环境里之前出现过的本地
  Supabase "缺 GRANT" 权限问题导致页面数据加载不出来，静态页面结构/背景
  色/空状态下的卡片 chrome（比如加载中骨架屏，如果有的话）依然应该能看到
  背景色变化，不强求一定要有真实数据渲染出完整卡片才能验证，尽力就好，
  不要在这个已知的基础设施问题上卡太久——如果卡住了，就说明白，把
  typecheck/test/build 跑通作为收尾。
- `grep -rn "bg-white" src --include="*.tsx"`（排除 `*.test.*`）：完工
  时确认没有残留。
- `npm run typecheck && npm run test && npm run build` 全部通过。
