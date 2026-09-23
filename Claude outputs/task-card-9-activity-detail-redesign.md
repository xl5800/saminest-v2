# 任务卡 9：找搭子详情页改版对齐方案图（activity-detail-page.tsx）

> 本卡遵循 `docs/04_Development/AI-Development.md` §27「AI 任务模板」的格式与流程要求。请在**独立 worktree + feature 分支**里完成，不要在别的任务分支上继续改。

建议 worktree / 分支：

```powershell
cd C:\Users\32092\Documents\Codex\saminest-v2
git worktree add ../saminest-v2-activity-detail-redesign -b feat/activity-detail-redesign origin/main
```

## 目标

按产品给的方案图，把活动详情页（`/activities/:id`，`activity-detail-page.tsx`）的信息顺序和内容做一次调整：

1. 调整页面顶部到中部的信息顺序。
2. 去掉两处冗余信息：频道/标签徽章 chip、"发起人：昵称" 文字链接。
3. 新增一个"已加入"参与者名单列表——每个已加入的参与者显示"昵称 + 年龄 + 地区"（例如"Kevin 25岁 · 住Arlington"），年龄/地区任一为空时优雅省略，不显示"undefined"、"null"或空的分隔符。

这是"找搭子详情页改版对齐方案图"这个大需求的第二张卡，第一张卡（任务卡 8）已经把 `profiles.age` 字段加上并合并、推送到 main、迁移已应用到生产——这张卡可以直接用。

## 背景 / 为什么改

产品验收找搭子列表页改版（任务卡 7c）时提出："我要我的找搭子详情页面和这张图片一样"（附方案图）。经过确认：

- 方案图里的"已加入"名单需要显示年龄和地区标签，产品明确要求"现在就要"，不接受先做无标签的名单再补标签——这也是为什么要先有任务卡 8 的 `age` 字段。
- 顺序调整、去掉冗余信息，是照着方案图来的视觉还原，不是产品口头逐项描述的，允许你在实现时按最接近方案图观感的方式处理边界情况（见下面"未在方案图里明确、需要你自行判断"这一节），但页面的核心信息顺序和这张卡列出的清单必须严格执行，不能自由发挥。

## 新的页面顺序（从上到下）

1. 标题（`{emoji} {title}`，不变）
2. 地点
3. 时间
4. "活动描述" 小标题 + 描述正文
5. 联系方式（如果发起人填了的话——沿用现在已有的展示逻辑和判断条件，只是把这一块挪到这个位置，逻辑本身不用改）
6. 参与者头像拼图（`ActivityParticipantAvatars`，`shape="square"` `showAllParticipants`，这块本身的样式/props 不用动，只是位置往下挪）
7. 仅发起人可见的"📢通知参与者"链接（如果当前登录用户是发起人才显示，逻辑不变，只是紧跟在头像块下面，和现在两者的相对位置保持一致，不要拆开）
8. 发起人 `PersonCard`
9. **"已加入"参与者名单列表（本卡新增，见下面单独一节）**
10. 底部按钮行（`ActivityParticipationButtonView` + "联系发起人"按钮，不变）

**删除**（不再显示）：

- 频道/标签徽章 chip（原来紧跟在标题下面那个）——频道信息已经通过标题里的 emoji 表达，不需要再重复一个 chip。
- "发起人：昵称" 文字链接——发起人身份已经通过下面的 `PersonCard` 展示，这行文字链接是重复信息。

## "已加入"参与者名单列表（新功能）

**展示内容**：对 `participants`（不含发起人，跟 `ActivityParticipantAvatars` 现在用的是同一份数据）里的每一个人，显示一行："{昵称}{age != null ? ` ${age}岁` : ""}{locationName != null ? ` · 住${locationName}` : ""}"。

- 年龄和地区都有：`Kevin 25岁 · 住Arlington`
- 只有年龄没有地区：`Kevin 25岁`
- 只有地区没有年龄：`Kevin · 住Arlington`
- 都没有：`Kevin`

地区名的格式化复用 `formatLocationDisplayName`（`data/us-states.ts`），跟页面顶部"地点"那一行、`profiles-repository.ts` 里 `locationName` 的现有用法保持一致的格式，不要另起一套格式化规则。

**空状态**：如果 `participants` 数组为空（活动目前只有发起人自己），这个列表区块整体不渲染（不显示"暂无人加入"之类的占位文案），跟 `ActivityParticipantAvatars` 自己处理空态的方式保持一致的克制程度。

**视觉呈现**：具体是简单的纵向列表（每行一个 `<p>` 或 `<li>`）还是要加头像小图标，请对照方案图来定——方案图里这块的具体视觉细节请你自己读图判断，只要求内容（昵称+年龄+地区，缺失字段优雅省略）和位置（PersonCard 之后、底部按钮之前）符合上面的规格。

## 数据层改动（`activities-repository.ts`）

现在的 `ActivityParticipant` 类型只有 `{ userId, displayName, avatarUrl }`，需要扩展：

```ts
export interface ActivityParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** 任务卡 9：参与者年龄，来自 profiles.age，跟 PublicProfile.age 同一个字段、
   *  同一套"可选、用户自己填"的语义，没有就是 null。 */
  age: number | null;
  /** 任务卡 9：参与者所在地区显示名，来自 profiles.location_id 关联的
   *  locations 表，跟 PublicProfile.locationName 同一套取法，没有就是 null。 */
  locationName: string | null;
}
```

找到现在构建 `ActivityParticipant[]` 的那个查询（应该是 `getActivityDetail`/`listActivityParticipants` 之类的函数，具体名字你在文件里找一下），在原来 join `profiles` 拿 `display_name`/`avatar_url` 的基础上，一并 join 出 `age` 和 `location_id → locations.name`，映射进新加的两个字段。参考 `getPublicProfile()`/`getMyProfile()` 里现成的 `locationName` 取法，不要另起一套 join 方式。

**这个函数除了 `ActivityCard` 列表页也在用之外**（`participants` prop 传给 `ActivityCard`），确认一下这次扩展字段会不会影响到 `ActivityCard` 那边的类型检查——正常情况下只是多了两个字段，`ActivityCard`/`ActivityParticipantAvatars` 不用这两个新字段，应该不需要改动，但请你在报告里确认一下这一点（比如贴一下 typecheck 通过的结果），不要假设"应该没事"就跳过验证。

## 未在方案图里明确、需要你自行判断的地方

- "已加入"列表的具体排版细节（字号、间距、是否要头像小图标）——按接近方案图观感处理即可，不用逐像素还原。
- 如果某个参与者的 `locationName` 是"线上"这种非地理位置的值（活动本身 `isOnline` 的情况跟参与者个人地区是两个不同概念，参与者的 `locationName` 应该就是他 profile 里正常的地区名，不会是"线上"），正常展示即可，不用特殊处理。

这些地方你可以按合理判断处理，但**不要**因为拿不准就跳过对应的功能——比如"已加入"列表本身必须实现，不能因为不确定排版细节就只做一半。

## 允许修改的文件

- `src/pages/activities/activity-detail-page.tsx`（+ `activity-detail-page.test.tsx`）
- `src/repositories/activities-repository.ts`（+ `activities-repository.test.ts`）——仅扩展 `ActivityParticipant` 类型和对应查询，不改其它函数

## 禁止修改的文件

- `src/components/activity-card.tsx`、`activity-card.test.tsx`
- `src/components/activity-participant-avatars.tsx`、`activity-participant-avatars.test.tsx`
- `src/pages/activities/activity-list-page.tsx`、`.test.tsx`
- 任何 `supabase/migrations/` 下的文件——这张卡不需要新迁移，`age`/`location_id` 两列都已经存在（`location_id` 一直都在，`age` 是任务卡 8 加的，生产库已经应用）
- 除 `activities-repository.ts` 之外的其它 repository 文件

## 具体要求

1. 严格按上面"新的页面顺序"清单调整，不要自行增删顺序里没提到的模块。
2. 删除频道/标签 chip 和"发起人：昵称"文字链接这两处，确认没有遗留的相关 CSS 类/未使用的 import。
3. 新增"已加入"名单列表，按上面的格式规则实现（年龄/地区缺失时优雅省略）。
4. 扩展 `ActivityParticipant` 类型 + 对应查询，加 `age`/`locationName` 两个字段，复用 `getPublicProfile()` 现成的 `locationName` 取法。
5. 确认这次类型扩展不会破坏 `ActivityCard`/`ActivityParticipantAvatars` 的类型检查（这两个文件本身不用改，但要验证）。
6. 组织者专属的"📢通知参与者"链接、联系方式展示、底部按钮行——这三块的**现有逻辑/判断条件不要改**，只是位置跟着挪。
7. 更新 `activity-detail-page.test.tsx`：删除针对 chip/"发起人：昵称"链接的旧断言，新增"已加入"列表的用例（含年龄/地区都有、只有一个、都没有、participants 为空这几种情况），新增顺序相关的断言。
8. 更新 `activities-repository.test.ts`：覆盖新查询返回的 `age`/`locationName` 字段（含 null 的情况）。
9. `npm run typecheck` / `npm run test` / `npm run build` / `git diff --check` 全部跑一遍，贴出真实结果。
10. 报告里明确列出：改了哪些文件、"已加入"列表的具体展示逻辑说明、`git diff origin/main -- src/pages/activities/activity-detail-page.tsx` 和 `git diff origin/main -- src/repositories/activities-repository.ts` 的完整 diff、有没有碰任何禁止修改的文件。

## 验收标准

- 详情页信息顺序跟方案图一致，冗余信息（channel chip、发起人文字链接）已删除。
- "已加入"名单能正确显示昵称+年龄+地区，缺失字段优雅省略，participants 为空时不显示空列表。
- 组织者专属链接、联系方式、底部按钮功能行为跟改版前完全一致（只是位置变了）。
- `ActivityCard`/`ActivityParticipantAvatars` 未被改动，类型检查通过。
- typecheck / test / build / git diff --check 全部干净。
