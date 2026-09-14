-- Migration: 报名审核结果通知改用 notify_user()，替换前端那条不可靠的私信
--
-- 为什么改（这版任务卡跟最初调研比范围收窄了，原因见下）：
--   最初的调研只查了 SQL 迁移文件，得出"发起人/参与者完全收不到通知"这个
--   结论——是错的。核实后发现两个方向其实都已经有前端 mutation hook
--   触发的真人私信在跑：
--   - 方向一（报名/申请加入 → 通知发起人）：
--     use-toggle-activity-participation-mutation.ts 的 notifyOrganizer()，
--     三种文案区分"报名了/申请加入去处理一下/退出了"，需要审核的那条还带
--     refActivityId，驱动会话页"查看申请 →"深链直接跳到
--     `/my-activities?pendingActivityId=` 展开对应审核面板——做得不差，
--     比这次原计划的 SQL 方案（写死跳 `/my-activities`）更精准，这次
--     **不碰**，不新增任何 trigger。
--   - 方向二（批准/拒绝 → 通知申请人）：
--     use-moderate-activity-participant-mutation.ts 的 notifyApplicant()，
--     靠 findExistingActivityConversation() 去找申请人当初申请时建的
--     会话——**找不到就静默跳过，不发通知，也不报错**，这是一个真实的
--     可靠性缺口。这次把这条私信整个换成这份迁移里的 notify_user()
--     调用，不依赖会话是否存在。
--
--   只处理方向二，理由：方向一现有机制本身可靠（mutation 成功后必定执行，
--   不依赖查会话），叠加一条数据库系统通知只会让发起人同时收到"私信 +
--   系统卡片"两条重复通知，不是修复缺口；方向二现有机制有真实的静默失败
--   路径，值得换成不依赖会话查找的数据库通知。
--
-- 具体怎么做：
--   直接在 approve_activity_participant/reject_activity_participant 两个
--   已有函数体末尾各加一行 perform notify_user(...)，不改函数签名、不改
--   现有的权限校验/grant execute（两条已经 grant 给 authenticated，这次
--   不用动）。select 语句从原来只查 v_organizer_id 一个变量，扩成同时查
--   v_participant_user_id/v_activity_id/v_activity_title 三个通知需要的
--   字段，用同一次联表查询取，不额外多发一次查询。
--
--   链接统一跳活动详情页 `/activities/:id`，不是"我的活动"——参与者对
--   这条已经处理完的 pending 记录没有任何后续操作可做，落到详情页至少
--   能看到活动本身信息。
--
--   不新增 notification_payload.kind 字段，留空走默认的通用系统通知卡片
--   样式——这是系统自动产生的事件通知，不是发起人手写的话，跟
--   approve_post/reject_post 是同一类，不是 notify_activity_participants()
--   （发起人手动群发）那一类，见该函数所在迁移文件顶部说明。
--
-- 影响哪些表：
--   不新建表、不加列、不新建函数。只改 approve_activity_participant/
--   reject_activity_participant 两个已有函数的函数体，函数体内额外调用
--   已有的 notify_user()（间接 insert 到已有的 public.conversations /
--   public.conversation_members / public.messages 三张表，逻辑在
--   notify_user() 内部，这里不重复）。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行。这次迁移生效之后新发生的审核事件才会触发
--   通知，不回填历史数据。
--
-- 权限：
--   两个函数本身的权限设计这次完全不动——revoke/grant 语句在
--   20260816175611_activity_join_approval.sql 里已经执行过（revoke from
--   public + grant execute to authenticated），create or replace 不会
--   重置已经授予的权限，这里不需要、也不应该重复这两行。notify_user()
--   本身的权限（只 revoke，不 grant 给任何角色，只能被其它 security
--   definer 函数内部调用）同样不动——这两个函数调用它跟
--   notify_activity_participants() 调用它是同一个已经验证过的模式，见
--   20260818162736_create_notify_user_function.sql 权限设计说明。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 本地验证：这份迁移已经在本地真实 Postgres/Supabase 环境（`supabase db
-- reset`）里验证过，覆盖了批准触发恰好一条"报名申请已通过"通知（不是
-- 两条）、拒绝触发恰好一条"报名申请未通过"通知、秒进场景
-- （requires_approval=false）不经过这两个函数不受影响、get_advisors 复查
-- 无新增安全提示这几个场景，详见 PR/任务报告。

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

create or replace function public.reject_activity_participant(target_participant_id uuid)
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
    raise exception 'only the activity organizer can reject participants';
  end if;

  update public.activity_participants
  set status = 'rejected'
  where id = target_participant_id
    and status = 'pending';

  if not found then
    raise exception 'participant % is not pending (already processed, or does not exist)', target_participant_id;
  end if;

  perform public.notify_user(
    v_participant_user_id,
    '报名申请未通过',
    format('很遗憾，你申请加入的《%s》未通过发起人审核。', v_activity_title),
    format('/activities/%s', v_activity_id)
  );
end;
$$;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- approve_activity_participant / reject_activity_participant 两个函数要
-- 手动改回这次改动之前的版本（去掉末尾 notify_user 调用那几行、把
-- select 语句缩回只查 v_organizer_id 一个变量），不能简单 drop——现在的
-- 版本承担着报名审核的核心业务逻辑，drop 会直接破坏审核功能。
