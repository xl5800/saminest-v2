# 任务卡（修订版）：报名审核结果通知改用数据库 notify_user()，替换掉前端那条不可靠的私信

## 对应 worktree
路径：`../saminest-v2-activity-join-notify`（已经建好，`npm install` 也跑过了，不用重新建）
分支：`feat/activity-join-notification`（从 `origin/main` 切出）

## 背景（这版任务卡跟第一版比，范围收窄了——原因写在这）

第一版任务卡的前提是错的：不是"发起人/参与者完全收不到通知"，是"收到的
方式是前端触发的真人聊天消息，不是 🔔Saminest 系统通知卡片"——这是我
最初调研时的疏漏，只查了 SQL 迁移文件，没查前端 `use-toggle-activity-
participation-mutation.ts`/`use-moderate-activity-participant-mutation.ts`
这两个 hook，Codex 接手后发现了这个，核实过确认是真的。

参考了一下 Meetup 官方文档
（["What notifications should organizers and members receive"](https://help.meetup.com/hc/en-us/articles/39488598910093-What-notifications-should-organizers-and-members-receive)）
之后，两个方向分开处理，跟 BARRY 确认过：

**方向一（有人报名/申请加入 → 通知发起人）：跳过，不做数据库改动。**
前端已有的 `notifyOrganizer()`（`use-toggle-activity-participation-mutation.ts`）
本身做得不差——三种文案区分"报名了/申请加入去处理一下/退出了"，申请加入
那条还带 `refActivityId`，驱动"查看申请 →"深链直接跳到审核面板，比第一版
任务卡 SQL 方案里写的 `/my-activities` 更精准。Meetup 这块的核心要求是
"立即触达 + 可操作"，Saminest 现在用"真人私信"这个形式已经满足，没必要
为了形式上像 Meetup 的系统通知卡片，就在这基础上再叠一条数据库通知——
那样只会导致发起人同时收到一条私信 + 一条系统卡片，是看得见的重复体验，
不是修复缺口。**这次任务卡不碰 `use-toggle-activity-participation-
mutation.ts`、不碰 `notifyOrganizer()`，也不新增任何 trigger。**

**方向二（发起人批准/拒绝 → 通知申请人）：用数据库 notify_user() 完全
替换掉前端那条私信。**
前端现在的 `notifyApplicant()`（`use-moderate-activity-participant-
mutation.ts`）靠 `findExistingActivityConversation()` 去找申请人当初
申请时建的会话——**找不到就静默跳过，不发通知，也不报错**，这是一个真实
的可靠性缺口（跟 Meetup"立即、不聚合"的要求比，Saminest 这边等于是
"可能压根不通知"）。这次把这条私信整个换成数据库层的 `notify_user()`
调用——不依赖会话是否存在，稳定可靠，且用户只会收到一条通知（不是私信+
系统卡片两条）。

## 每个文件的要求

### 1. 新建迁移文件 `supabase/migrations/<按现有命名习惯，当前时间戳>_notify_applicant_on_activity_moderation.sql`

只做方向二这一件事——在已有的两个 RPC 函数体末尾各加一行
`notify_user()` 调用，不改函数签名、不改现有的权限校验/`grant execute`：

```sql
create or replace function public.approve_activity_participant(target_participant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_organizer_id uuid;
  v_participant_user_id uuid;
  v_activity_id uuid;
  v_activity_title text;
begin
  select a.organizer_id, ap.user_id, a.id, a.title
    into v_organizer_id, v_participant_user_id, v_activity_id, v_activity_title
  from public.activity_participants ap
  join public.activities a on a.id = ap.activity_id
  where ap.id = target_participant_id;

  if v_organizer_id is null then
    raise exception 'participant record % not found', target_participant_id;
  end if;

  if v_organizer_id <> auth.uid() then
    raise exception 'only the activity organizer can approve participants';
  end if;

  update public.activity_participants
  set status = 'approved'
  where id = target_participant_id
    and status = 'pending';

  if not found then
    raise exception 'participant % is not pending (already processed, or does not exist)', target_participant_id;
  end if;

  perform public.notify_user(
    v_participant_user_id,
    '报名申请已通过',
    format('你申请加入的《%s》已通过发起人审核，快去看看吧。', v_activity_title),
    format('/activities/%s', v_activity_id)
  );
end;
$$;
```

`reject_activity_participant` 照抄同一个改法：`select` 语句同样扩成
`v_organizer_id`/`v_participant_user_id`/`v_activity_id`/`v_activity_title`
四个变量（原来只查了 `v_organizer_id` 一个），`update` 的
`status = 'rejected'` 那部分不动，函数末尾加：

```sql
  perform public.notify_user(
    v_participant_user_id,
    '报名申请未通过',
    format('很遗憾，你申请加入的《%s》未通过发起人审核。', v_activity_title),
    format('/activities/%s', v_activity_id)
  );
```

链接跳活动详情页（`/activities/:id`），不是"我的活动"——参与者对这条
`pending` 记录没有任何后续操作可做，落到详情页至少能看到活动本身信息。

**不新增 `kind` 字段**，留空走默认的通用系统通知卡片——这次是系统自动
产生的事件通知，不是发起人手写的话，跟 `approve_post`/`reject_post` 是
同一类，不是 `notify_activity_participants()`（发起人手动群发）那一类。

迁移文件末尾照抄站内约定加回滚方案注释（默认不执行）：

```sql
-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- approve_activity_participant / reject_activity_participant 两个函数要
-- 手动改回这次改动之前的版本（去掉末尾 notify_user 调用那几行、把
-- select 语句缩回只查 v_organizer_id 一个变量），不能简单 drop——现在的
-- 版本承担着报名审核的核心业务逻辑，drop 会直接破坏审核功能。
```

### 2. `src/features/activities/use-moderate-activity-participant-mutation.ts`

删掉 `notifyApplicant()` 这个函数本身，以及 `mutationFn` 里
`try { await notifyApplicant(input); } catch (...) { ... }` 这几行调用——
批准/拒绝的通知这次完全交给数据库那条新加的 `notify_user()`，前端不用
再自己发一次。

删掉之后顺手清理变成死代码的部分，不要留着不用的 import/变量：
- `sendMessage`（`../../repositories/messages-repository`）、
  `findExistingActivityConversation`（`../../repositories/conversations-
  repository`）这两个 import，如果删完 `notifyApplicant()` 之后这个文件
  里没有其它地方还在用，就一并删掉 import。
- `ModerateActivityParticipantInput` 里 `applicantId`/`organizerId`/
  `activityTitle` 三个字段，原来只是给 `notifyApplicant()` 用的——如果
  删完发现调用方（`my-activities-page.tsx`）传这几个字段就是单纯为了
  喂给这个 hook、没有其它用途，可以顺手把接口和调用点一起简化掉，去掉
  这几个不再需要的字段；如果调用方那边这几个字段的获取/传递不是三两行
  就能干净拆掉的（比如混在别的逻辑里不好拆），保留这几个字段但不用也
  没关系，不用为了"接口干净"额外扩大这次改动的范围——两种做法都可以，
  自己判断哪种改动更小、更不容易引入新 bug。

### 3. `src/repositories/conversations-repository.ts`（视情况）

`findExistingActivityConversation()` 目前唯一的调用方就是这次要删掉的
`notifyApplicant()`（改之前先确认一下这一点没有变，可能这期间有其它
并行任务卡也在改这个仓库）。如果确认删完之后这个函数彻底没有别的调用方
了，把这个函数本身、它对应的单元测试（`conversations-repository.test.ts`
里的相关 `describe`/`it` 块）一并删掉，不留孤儿代码；如果发现还有其它
地方在用，就不要动这个函数，保留现状。

## 明确不做的事

- **不碰 `use-toggle-activity-participation-mutation.ts`，不碰
  `notifyOrganizer()`**——方向一这次跳过，理由见上面"背景"部分，不需要
  再跟 BARRY 确认第二遍。
- **不新增任何 trigger、不新建任何新的数据库函数**——这次只改
  `approve_activity_participant`/`reject_activity_participant` 两个已有
  函数的函数体，不新增别的。
- **不新增 `notification_payload.kind` 的新取值**——留空，走通用系统
  通知卡片样式。
- **不做推送/邮件通知**——Meetup 的多渠道（email/push/inbox）参考只是
  用来判断"要不要立即通知、要不要做成系统通知"这两个设计问题，Saminest
  目前没有邮件/推送通知基础设施，这次不新增，只用站内已有的
  `notify_user()`（落到会话列表里的系统通知卡片）这一个渠道。
- **不回填历史数据的通知**——只覆盖这次迁移生效之后新发生的审核事件。
- **不改 `activity_participants_insert_own`/`activity_participants_
  update_own` 这两条 RLS 策略**、**不改 `approve_activity_participant`/
  `reject_activity_participant` 现有的权限校验逻辑**——这次只是在函数体
  末尾追加一行通知调用，不动其它任何已有逻辑。

## 验证要求

- 本地 Supabase 环境（`supabase db reset` 或等效方式）真实验证：
  - 发起人批准一条 `pending` 申请 → 申请人的会话列表里出现**恰好一条**
    系统通知，标题"报名申请已通过"，链接指向 `/activities/:id`——不是
    两条（不应该再有一条来自前端的私信气泡）。
  - 换一条记录测拒绝，申请人收到"报名申请未通过"，同样恰好一条。
  - 确认秒进场景（`requires_approval = false`）完全不受影响——秒进
    走的是 `status='approved'` 直接 insert，不经过这两个 RPC 函数，这次
    改动不会碰到这条路径。
  - 确认方向一（报名/退出通知发起人）行为跟改动前完全一样——这次没有
    动 `use-toggle-activity-participation-mutation.ts`，理论上不该有
    任何变化，但既然涉及同一个功能区域，花两分钟点一下确认没有意外
    回归。
- `notify_organizer_on_activity_join` 这个函数名**不应该存在**于这次的
  迁移里（提醒一下，避免跟第一版任务卡的设计搞混）。
- 确认 `notify_user()` 本身的执行权限没有被这次改动意外影响（这次只是
  在已有函数里多 `perform` 一次已有的 `notify_user()`，理论上不会碰
  权限，但既然之前踩过"新建函数默认多给 anon 一份权限"的坑，跑一下
  `get_advisors` 确认一下没有新的安全提示出现）。
- `npm run typecheck && npm run test && npm run build` 全部通过。如果
  删除 `notifyApplicant()`/精简 `ModerateActivityParticipantInput` 之后
  有测试断言了旧的字段/旧的行为（比如断言发送了私信、断言传了
  `applicantId` 之类），按需更新，不代表出了其它问题。
- 迁移文件本身跑一遍 `supabase db reset`（或项目里等效的本地校验方式）
  确认能干净应用。
