# 任务卡：活动参与者可见性 + 聊天页三个问题（滚动定位 / 头像字号）

## 对应 worktree
路径：`../saminest-v2-chat-fixes`
分支：`fix/participants-visibility-and-chat-ux`（从 `origin/main` 切出）

## 背景

BARRY 真机测试时发现三个独立问题，都已经在代码里定位到根因，这张任务卡分三个部分，互不依赖，可以按顺序做：

1. **没有报名活动的用户看不到已经参加活动的参与者名单**——这是故意的 RLS 权限漏洞（不是前端 bug），需要新增一条数据库策略。BARRY 的诉求很明确："这样才能吸引用户参与活动"——也就是说这个可见性应该是产品行为，不是权限收紧后的副作用。
2. **点击"咨询"等按钮进入已有对话时，聊天没有自动跳到最新消息**，停留在几天前的历史消息位置，需要手动下滑。
3. **聊天界面头像和消息字体太小**，要求参考小红书私信界面的尺寸感。

## 第一部分：活动参与者可见性（数据库 RLS，需要新迁移 + 部署到生产）

### 根因

`activity_participants` 表当前只有三条 SELECT 策略（`supabase/migrations/20260815042354_create_go_together_activities_schema.sql` + `20260816195356_fix_activity_participants_select_joined_recursion.sql` 改写过其中一条）：

- `activity_participants_select_organizer`：活动发起人能看到自己活动下的所有报名记录。
- `activity_participants_select_joined`（现在是 `is_fellow_activity_participant()` 包装的版本）：**只有自己已经是这个活动的有效参与者，才能看到同一个活动下的其它参与者记录**。
- `activity_participants_select_own`：能看到自己的报名记录（不管什么状态）。

这三条策略没有一条覆盖"还没报名、只是路过看看这个活动的用户"——这类用户对 `activity_participants` 表完全没有 SELECT 权限，`listActivityParticipants()`/`listActivityParticipantPreviews()`（`src/repositories/activities-repository.ts`）这两个查询函数本身的逻辑是对的（已经在过滤 `status = 'approved'` 且 `cancelled_at is null`），问题是 RLS 在查询函数够到数据库之前就把整个结果集清空了，前端拿到的永远是空数组，所以活动卡片头像堆叠、活动详情页"已加入"名单，对没报名的用户来说是空的或者显示不全。

### 修法

新增一条数据库迁移，加一条公开可见的 SELECT 策略——口径完全对齐 `listActivityParticipants()` 已经在用的过滤条件（`status = 'approved' and cancelled_at is null`），只把"已确认、未取消"的参与者暴露出去，不暴露 `pending`（审核中）/`rejected`（被拒绝）的申请记录，也不暴露已删除/已取消活动下的参与者：

```sql
-- 活动参与者名单应该对所有人可见（不只是已加入的人），这样才能起到
-- "吸引更多人报名"的作用——之前只有 activity_participants_select_organizer/
-- select_joined/select_own 三条策略，没有一条覆盖"还没报名、只是路过看
-- 这个活动的用户"，导致这类用户看不到任何参与者。这条新策略口径完全
-- 对齐 listActivityParticipants()/listActivityParticipantPreviews()
-- （activities-repository.ts）已经在做的前端过滤：只放行 status='approved'
-- 且 cancelled_at is null 的记录（不暴露审核中/被拒绝的申请），且只对
-- 公开可见的活动生效（跟 activities_select_public 用同一个判断条件：
-- deleted_at is null and status <> 'cancelled'）。
create policy activity_participants_select_public on public.activity_participants
  for select
  using (
    status = 'approved'
    and cancelled_at is null
    and exists (
      select 1 from public.activities a
      where a.id = activity_participants.activity_id
        and a.deleted_at is null
        and a.status <> 'cancelled'
    )
  );
```

这条策略不需要包成 security definer 函数——它查询的是另一张表（`activities`），不是自己表的自引用子查询，不会触发之前遇到过的 RLS 递归问题（`activity_participants_select_organizer` 已经是同样的写法，一直没出过问题）。

新增这条策略之后，原来三条策略（organizer/joined/own）**都不用删**——Postgres 的多条 SELECT 策略是"或"的关系，新加一条只会让能看到的人更多，不会收紧任何人现有的权限。

### 前端

**大概率不需要改任何前端代码**——`listActivityParticipants()`/`listActivityParticipantPreviews()` 的查询逻辑本来就是对的，只是被 RLS 拦住了。改完数据库策略之后，用没报名过任何活动的测试账号打开一个别人发起的、已经有人报名的活动，确认详情页"已加入"名单和活动卡片的头像堆叠都能正常显示。如果验证时发现还有地方显示不出来，先看是不是这条新策略本身的问题（比如条件写错），不要在前端加多余的兜底逻辑掩盖数据库层的问题。

### 部署

这条策略改完之后，**先在本地跑通验证，然后需要单独把这份迁移 apply 到生产数据库**（这次任务卡不自动做这一步，完工报告里说明"待部署到生产"，我这边会照 session 里一直在用的流程：独立核实 → 用户确认 → apply_migration → 核实生效），不是合并代码就自动生效的那种改动。

## 第二部分：聊天页进入已有对话不自动滚动到最新消息

### 根因

`src/pages/messages/conversation-page.tsx` 里 `data-testid="conversation-messages"` 这个消息列表容器（约第 547-550 行）整个文件里**没有任何滚动定位逻辑**——没有 ref、没有 `scrollIntoView`、没有任何 `useEffect` 处理滚动位置。消息一直是按 `created_at` 升序整批查出来（`listMessages()`，`src/repositories/messages-repository.ts`，没有分页），全部渲染进这个 `overflow-y-auto` 的容器里，容器的滚动位置默认停在浏览器/WebView 给的初始值（实际观察是停在顶部或者上次缓存的位置），从来没有主动定位过。消息少的时候内容一屏放得下，看不出问题；真实对话攒了几天的消息之后，问题就会被注意到，这是"从来没做过这件事"，不是"最近改坏的"。

### 修法

给这个消息列表容器加一个 `ref`，用 `useEffect` 在以下两种情况下把容器滚动到底部（滚动到底部直接用 `scrollTop = scrollHeight`，不需要平滑动画，参考大多数聊天 App 打开会话时的观感）：

1. **首次进入这个会话、消息加载完成时**（`messagesPending` 从 true 变成 false 且 `messageList.length > 0` 的那一刻）——这是这次任务卡要修的主要问题。
2. **自己发送新消息成功之后**（`sendMessageMutation` 成功、消息列表因为 invalidate 重新拉取之后）——顺手一起做，避免出现"能看到历史消息自动到底，但自己发消息之后又要手动滑下去看自己刚发的"这种不一致体验。这条不是 BARRY 明确提的，但明显是同一类问题、如果不做后续多半会被反馈，写进完工报告说明这是顺带做的，不是凭空加范围。

具体实现方式不强制（`useRef` + `useEffect` 依赖 `messageList` 是最直接的做法），但要注意：
- 不要在用户正在往上滚动查看历史消息时把它强行拉回底部——只在"消息列表变化"这个时机执行一次滚动到底，不要做成持续锁定底部的效果（这个仓库没有 Realtime 订阅、消息列表只在首次加载和自己发消息成功后才会变化，不存在对方消息实时推进导致的持续滚动打扰问题，所以这一条实际上不需要额外处理，只是说明为什么这次修法不用做"用户是否在底部附近"这类更复杂的判断）。
- 系统通知类消息（`isSystemMessage`）和普通聊天消息共用同一个 `<ul>`/容器，滚动到底部的逻辑不需要区分消息类型。

## 第三部分：聊天页头像和字体太小，对齐小红书私信界面的尺寸感

### 现状

`src/pages/messages/conversation-page.tsx` 里：
- 消息气泡两侧头像（`data-testid="message-avatar"`/`message-avatar-self"`，约第 622-628 行和 670-677 行）：`sizeClassName="h-7 w-7"`（28px）。
- 消息气泡文字（约第 640-648 行）：`text-sm`（14px）。

### 改法

- 头像从 `h-7 w-7`（28px）放大到 `h-9 w-9`（36px）——小红书私信界面头像大致在这个量级，比现在的 28px 明显更符合"一眼能看清是谁"的观感，也不会大到挤占气泡宽度。
- 消息文字从 `text-sm`（14px）放大到 `text-base`（16px）——这是这个项目里正文的标准字号（`src/index.css` 顶部注释里"Body（正文，含所有表单控件）text-base（16px）"那条约定），聊天消息本来就属于"正文"这一档，之前用 `text-sm` 偏小，这次统一成 `text-base`，跟项目其它地方的正文字号也保持一致。
- 气泡的内边距 `px-3 py-2` 可以跟着放大一档到 `px-3.5 py-2.5`，让文字放大后气泡不会显得局促（这条是配合字号改动的合理调整，不是额外加的视觉需求）。
- 头像放大之后确认气泡的 `max-w-[75%]` 限制和 `gap-2` 间距看起来是否还协调，如果视觉上头像和气泡挤在一起，可以把 `gap-2` 微调到 `gap-2.5`，这个数值不强制，以实际截图观感为准。
- **这几个具体数值（36px/16px/gap-2.5）是我给的估算目标，不是像素级精确要求**——改完之后请截图/真机看一下头像和文字的实际比例，如果明显偏大或偏小，在合理范围内自己微调，完工报告里说明最终定的数值和理由。
- 时间分割线（约第 582-589 行 `<time>`）和系统通知卡片的字号这次不用跟着放大——BARRY 反馈的是"头像和消息字体"，这两处不是聊天气泡本身，保持现状。
- 顶部头部（header，约第 472-545 行）的头像/标题字号不在这次范围内，只改消息列表里的气泡头像和正文文字。

## 明确不做的事

- **不改任何布局结构**——三个部分都是"加一个 RLS 策略"/"加一段滚动定位逻辑"/"改几个尺寸 class"，不重新设计聊天页的整体布局，不动头部/输入框区域的结构。
- **不引入 Realtime 订阅**——第二部分的滚动修复不是为了配合实时消息推送做的，这个仓库目前没有 Realtime，不在这次任务范围内引入。
- **不动 `listMessages()` 的分页方式**——目前是一次性查出全部消息，这次不改成分页/虚拟滚动，滚动到底部的修法要在"一次性全量渲染"这个现状下work。
- **不改 `activity_participants` 现有三条 SELECT 策略的任何一条**——只新增一条，不删除、不修改 `select_organizer`/`select_joined`/`select_own`。
- **第一部分的数据库迁移不要自己 apply 到生产**——本地/开发环境验证通过即可，生产部署这次由我在收到完工报告之后单独走一遍确认+核实的流程。

## 验证要求

- **参与者可见性**：本地跑迁移之后，用一个没有报名过任何活动的测试账号，打开另一个账号发起、且已经有人报名成功的活动详情页，确认能看到已加入的参与者头像/名单（不只是自己发起或自己已报名的活动）；同时确认 `pending`（审核中）状态的报名记录**不会**被这个没报名的账号看到（用一个开启了"需要审核"的活动测试，报名一个账号但不批准，确认第三个没报名的账号看不到这条 pending 记录，只有 approved 的才可见）。
- **聊天滚动**：找一个有较多历史消息（多到能超出一屏）的会话，从会话列表点进去，确认一进入就已经停在最新消息位置，不需要手动下滑；再发一条新消息，确认发送后也能看到自己刚发的这条（不需要手动下滑）。
- **头像字体尺寸**：截图或真机看一下改动前后对比，确认头像/文字明显变大且比例协调，没有把气泡撑得过宽导致换行异常。
- `npm run typecheck && npm run test && npm run build` 全部通过——第二/三部分涉及的 `conversation-page.test.tsx` 断言如果有具体 class/尺寸相关的，按需同步更新。
- 完工报告里分三段说明每个部分具体改了什么、验证结果，第一部分额外注明"待部署到生产"。
