# 任务卡：活动详情页——发起人不能报名自己的活动 + "已加入"名单加头像/简介

对应 worktree：`C:\Users\32092\Documents\Codex\saminest-v2-activity-organizer-fix`，分支 `feat/activity-organizer-join-fix`（从最新 `origin/main` 切出）。

## 背景

`src/pages/activities/activity-detail-page.tsx` + `use-activity-participation-action.ts` 现在没有判断"当前登录用户是不是这场活动的发起人"，发起人理论上可以对自己发起的活动点"我要报名"/"参加活动"。BARRY 确认过参与人数的计算逻辑本身是对的（"还差 N 人"这个数字没问题，不需要改），唯一需要修的是"发起人不能报名自己发起的活动"这条规则。顺带把"已加入"名单的展示样式改一下：去掉分隔线，每行加头像+个人简介。

## 1. 发起人不能报名自己发起的活动

- `use-activity-participation-action.ts` 的 `useActivityParticipationAction` 已经接收 `organizerId` 参数，但目前只是转发给 `toggleParticipation.mutate`，没有拿它跟当前登录用户 `userId` 比较。这里加一个判断：`userId === organizerId` 时，返回一个新的分支（类似现有的 `loggedOut`/`isRejected` 这几个特殊分支），按钮禁用、点击无效，文案改成类似"你是发起人"这样的提示（具体文案你自己定，参考现有几种状态文案的语气）。
- `activity-detail-page.tsx` 里 `canTapEmptySlot = !participationAction.disabled && !participationAction.isApproved`——发起人这个新分支只要 `disabled` 为 `true`，这一行不用额外改，头像堆叠的空位自然也不可点。
- 数据库函数（`join_activity`/类似的 RPC，具体名字自己查 `supabase/migrations`）如果本身没有拒绝"发起人加入自己的活动"，看情况是否需要加一条后端校验兜底——前端隐藏/禁用按钮只挡住了正常 UI 路径，如果这个校验只做在前端、后端完全没挡，建议顺手加上（照抄这个仓库"前端隐藏 + 数据库函数也拒绝"的一贯双重保险模式，比如 `contact-seller-button.tsx` 注释里提到的"数据库函数也会拒绝"那个例子）。如果查证后发现后端本来就已经拒绝了，完工报告里说明清楚，不用重复加。

## 2. "已加入"名单：去掉分隔线，加头像+个人简介

- 现在 `activity-detail-page.tsx` 里 `已加入` 那个 `<ul className="divide-y divide-border ...">`，每行是 `formatJoinedParticipantLine(participant)` 纯文字（昵称+年龄+地区）。这次改成：
  - 去掉 `divide-y divide-border`，改成普通不带分隔线的列表（每行之间留一点间距就行，别用边框/分隔线）。
  - 每行左边加圆形头像（没有头像时首字母兜底圆圈，跟仓库其它地方一致的样式）。
  - 每行加"个人简介"（bio）——先查一下 `ActivityParticipant` 类型（`activities-repository.ts`）和它背后的查询有没有已经带出 `bio`/`avatar_url` 这两个字段。如果没有，需要跟着 `display_name`/`age`/`location_name` 一起扩展这条查询（参考 `profiles-repository.ts` 里 profile 有没有现成的 bio 字段可以直接复用）。个人简介比较长时做省略处理（单行截断或限制行数，你自己判断，参考仓库里其它地方"过长文字截断"的现有写法，比如 `truncate`/`line-clamp`）。
  - 昵称/年龄/地区这几项现在 `formatJoinedParticipantLine` 拼出来的信息保留，不用删；头像和个人简介是新加的，不是替换。

## 明确不做的事

- 不改"还差 N 人"这个人数计算逻辑——BARRY 已经确认现在的计算是对的。
- 不改头像堆叠组件（`activity-participant-avatars.tsx`）本身的展示逻辑/形状，只改"已加入"这个文字名单区块。
- 不给活动详情页加留言区（BARRY 明确说了"先不做"）。
- 不改报名审核制（`requiresApproval`）相关的其它状态（申请中/已拒绝等），只加"发起人不能报名自己的活动"这一个新分支。

## 验收标准

- 发起人打开自己发起的活动详情页，"参加活动"按钮和头像堆叠的空位都不能触发报名（按钮文案清楚说明"你是发起人"这类提示，不是灰掉但没解释）。
- 其他用户（非发起人）报名/退出流程跟改动前完全一致，没有被这个新判断误伤。
- "已加入"名单不再有分隔线，每行能看到参与者头像（或首字母兜底）+ 昵称/年龄/地区（保留）+ 个人简介。
- 现有活动详情页测试全部通过，新增测试覆盖"发起人不能报名"和"已加入名单新样式"这两块改动。
