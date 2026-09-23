请在当前 Saminest 仓库中完成以下任务。

工作分支：请基于 origin/main 新建一个 worktree + 独立分支（例如 `git worktree add ../saminest-v2-activity-card-redesign -b feat/activity-card-redesign origin/main`），不要在 main 或其它任务的分支/worktree 里操作。

背景：
- "找搭子"列表页（/activities）的卡片组件是 `src/components/activity-card.tsx`，头像堆叠是共享组件 `src/components/activity-participant-avatars.tsx`（`ActivityParticipantAvatars`，活动详情页 `activity-detail-page.tsx` 也在用同一个组件）。
- 现在列表页卡片的视觉顺序（从上到下）是：头像方块拼图（14 号卡定的，铺满卡片整宽、贴着卡片顶部和左右边缘，没有卡片自己的内边距）→"还差 N 人（X/Y）"文字 → 标题（emoji + 文字）→ 地点 → 时间（地点和时间是两行分开的文字）。
- 产品现在要把这个顺序改成：标题（emoji + 文字）在最上面 → 地点和时间合并成一行摘要 → 一行明显更小、不铺满卡片宽度的参与者头像（发起人 + 参与者 + 空位，方块带小圆角）→"还差 N 人（X/Y）"文字。参考产品给的方案图，两个例子大致是这样（供你对照效果，不是要求逐像素还原）：
  - 例 1：标题「🏋️ 一起健身增肌」，摘要行「Gold's Gym Arlington · 09/06 周日 14:00」，下面一行小号头像格子（3 个已加入头像 + 若干空位，容量 6），再下面「3/6 人」。
  - 例 2：标题「🍣 有人要一起吃寿司吗」，摘要行「Washington, DC · 08/30 12:51」，下面一行小号头像格子（2 个已加入头像 + 若干空位，容量 5），再下面「2/5 人」。
  - 头像格子明显比现在小很多（大致 40-48px 量级的方块，不是现在铺满卡片宽度算出来的大格子），左右两侧留正常的卡片内边距（不再贴边），多于一行时自然换行，不需要横向滚动。

目标：
按上面的顺序和头像尺寸改版 `ActivityCard`（活动列表页卡片），效果对齐方案图描述。

允许修改：
- `src/components/activity-card.tsx`——调整内部结构顺序、样式，把地点和时间合并成一行。
- `src/components/activity-participant-avatars.tsx`——只允许新增，不允许修改任何现有 prop 组合（`shape="round"` 默认调用点 / `shape="square"` 不带 `showAllParticipants` / `shape="square"` 带 `showAllParticipants`）已有的渲染结果或样式。具体做法自己决定（比如新增一个 `size` 之类的 prop，默认值维持原有行为完全不变；只有活动卡片这个调用点显式传新值），只要保证：(a) `activity-detail-page.tsx` 这次完全不改、它的头像堆叠观感必须跟改版前逐像素一致；(b) 活动卡片这次要的新尺寸/新排布只在 `activity-card.tsx` 这一个调用点生效。
- 如果 `src/pages/activities/activity-list-page.test.tsx` 或其它现有测试因为这次改版而断言的内容真的过时了（比如断言了旧的 DOM 结构/类名/顺序），可以同步更新这些测试断言，但不能删测试用例本身，也不能为了让测试通过而弱化断言的严谨程度。

禁止修改：
- `src/pages/activities/activity-detail-page.tsx`——详情页这次完全不动，头像还是维持 `shape="square"` + `showAllParticipants` 的现有效果。
- `src/pages/activities/activity-list-page.tsx`——这次只改卡片本身，不改列表页顶层的筛选/搜索/TopBar 逻辑。
- 任何数据库/迁移文件——这次是纯前端视觉改版，不涉及任何数据结构或查询逻辑变化。
- `formatActivityParticipantSummary`（`src/utils/format.ts`）——"还差 N 人（X/Y）"这句文案已经包含了方案图要的"X/Y"信息，不需要改这个函数，直接复用现有文案即可。

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/02_SystemDesign/Architecture.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
2. 先检查 git status。
3. 不覆盖现有未提交修改。
4. 不创建第二个 Supabase Client。
5. 不注册第二个 Auth listener。
6. 不创建第二个 QueryClient，不创建职责重复的 Zustand Store。
7. 这次不涉及数据库变化，不需要新建 migration。
8. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
9. 不自动提交或推送。
10. 完成后报告：
    - 修改摘要
    - 文件清单
    - 验证结果（包括：跑了哪些测试、有没有因为这次改版更新了哪些现有测试断言、详情页的头像堆叠有没有受影响——请明确说明你是怎么确认详情页没被这次改动影响到的，比如贴一下详情页相关测试的运行结果）
    - git status
    - 剩余风险
