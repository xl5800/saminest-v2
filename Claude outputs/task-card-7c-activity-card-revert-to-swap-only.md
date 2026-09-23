请在已有的 worktree `../saminest-v2-activity-card-redesign`（分支 `feat/activity-card-redesign`，已经有两次提交并推送到 origin：`1c69168` 首次改版、`6489a60` 把头像格子从 44px 改回 64px）里继续这次任务，不要新建 worktree/分支，也不要碰其它任务的 worktree/分支。

背景：
- 产品验收了两轮之后反馈：之前理解错了需求范围——产品原话"我只是想再预览卡片把头像和文字互换位置，但是你把头像和文字都改的很小"，明确表示"整体都偏小，想干脆只做位置互换"。
- 也就是说，这次改版做过头了：合并地点+时间成一行、头像格子从"贴边铺满整卡的大方块"改成"缩小的、带内边距的小方块"、卡片内边距结构从两段式改成统一 p-5，这几件事产品都不要——产品要的只是"把标题/地点/时间这一块文字，和头像拼图这一块，两者的上下顺序换一下"，除了顺序之外，其它一切视觉细节都要跟改版之前（也就是 14 号卡定的样子）完全一样：头像还是贴边铺满整卡宽度的大方块拼图、地点和时间还是两行分开的文字、"还差 N 人"的文案还是跟着头像拼图走（在头像拼图下面）、内边距还是原来"头像区不带内边距、文字区单独一层 p-5"的两段式结构。

目标：
把 `ActivityCard`（`src/components/activity-card.tsx`）和 `ActivityParticipantAvatars`（`src/components/activity-participant-avatars.tsx`）**完全还原**到这次改版之前（即 14/17 号卡定下、`origin/main` 在这个改版分支分出来之前）的样子，唯一保留的改动是：卡片顶层"文字块"（标题+地点+时间）和"头像拼图块"这两个直接子元素的上下顺序对调——文字块在上，头像拼图块在下。除了这一点顺序对调之外，不应该跟改版前的渲染结果有任何其它可观察的差异（类名、字体大小、内边距、头像格子大小/形状/排布，全部跟改版前逐字节一致）。

具体做法：
1. `src/components/activity-card.tsx`：拿 `git show origin/main:src/components/activity-card.tsx`（改版前的版本）作为唯一的参照基准，把里面 `<ActivityParticipantAvatars .../>` 那段 JSX 和下面 `<div className="p-5 pt-3">...</div>` 那段 JSX 的顺序对调（`<div>` 先出现，`<ActivityParticipantAvatars>` 后出现），除了顺序，两段 JSX 各自内部（包括 `<ActivityParticipantAvatars>` 传的每一个 prop、`<div>` 的 className、里面的地点/时间是不是分开两个 `<p>`）都必须跟 `origin/main` 那份逐字一致——具体来说：`ActivityParticipantAvatars` 这次调用点不应该再传 `size="compact"` 这个 prop（这个改版分支这次要整个撤销），地点和时间要重新拆回两个独立的 `<p>`（不再用 " · " 拼成一行）。外层 `<Link>` 需要的 className（`overflow-hidden`、有没有统一的 `p-5`）也要跟 `origin/main` 那份逐字一致，不要保留这次改版加的统一 `p-5` 内边距结构。
2. `src/components/activity-participant-avatars.tsx`：这次改版新增的 `size` prop（`"default" | "compact"`）、`COMPACT_AVATAR_SIZE_CLASS_NAME`/`COMPACT_AVATAR_TILE_CLASS_NAME`/`COMPACT_EMPTY_SLOT_CLASS_NAME`/`COMPACT_AVATAR_GRID_CLASS_NAME`/`COMPACT_CROWN_BADGE_SIZE_CLASS_NAME`/`COMPACT_CROWN_ICON_SIZE`/`COMPACT_PLUS_ICON_SIZE` 这些常量、`SlotAvatarProps`/`SlotAvatar` 里的 `compact` 参数、主组件里的 `isCompact` 判断逻辑——这些这次改版新增的东西现在没有任何调用点在用了（活动卡片改回不传 `size`），应该完整删除，不要留成没人用的死代码。用 `git diff origin/main -- src/components/activity-participant-avatars.tsx` 确认改完之后这个文件跟 `origin/main` 那份逐字一致（这个文件这次改版没有其它需要保留的改动——`showAllParticipants`/`shape` 这些更早期任务卡加的东西不受影响，因为它们本来就不是这次改版碰的）。
3. 测试：
   - `src/components/activity-card.test.tsx`：改版前的原始测试用例（可以用 `git show origin/main:src/components/activity-card.test.tsx` 查看）里，跟"头像铺满卡片整宽贴边"、"地点/时间分两行"相关的断言应该恢复；这次改版新增的、断言"合并成一行"/"64px 小方块"/"统一 p-5"的用例应该删掉或改回验证"顺序对调"这一件事本身（比如断言文字块在 DOM 里排在头像拼图块前面）。
   - `src/components/activity-participant-avatars.test.tsx`：删掉这次改版新增的 `describe("size='compact' ...")` 那一整块测试（因为对应的功能已经整个撤销），确认删除之后这个文件的其它测试跟 `origin/main` 那份逐字一致。
4. `src/pages/activities/activity-detail-page.tsx`：这次任务完全不碰，继续保持跟改版之前逐像素一致——这一点从第一版改版到现在从来没变过，这次也一样。

允许修改：
- `src/components/activity-card.tsx`
- `src/components/activity-card.test.tsx`
- `src/components/activity-participant-avatars.tsx`
- `src/components/activity-participant-avatars.test.tsx`

禁止修改：
- `src/pages/activities/activity-detail-page.tsx`
- `src/pages/activities/activity-list-page.tsx`
- 任何数据库/迁移文件
- 除上面 4 个文件之外的其它文件

要求：
1. 先检查 git status（这个 worktree 应该是干净的，之前两次提交都已经推送）。
2. 不覆盖现有未提交修改。
3. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
4. 不自动提交或推送。
5. 完成后报告：
   - 修改摘要
   - 文件清单
   - 验证结果（尤其请明确给出 `git diff origin/main -- src/components/activity-participant-avatars.tsx` 的结果，证明这个文件除了确认没有遗留改动之外没有别的意思——如果这条 diff 不是空的，说明还有没清理干净的地方，需要继续改到它是空的为止）
   - git status
   - 剩余风险
