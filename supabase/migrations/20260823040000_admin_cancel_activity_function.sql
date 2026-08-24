-- Migration: 管理员下架违规活动
--
-- 为什么改：
--   UGC 安全功能补齐任务卡 4——管理员处理活动举报时，需要能勾选"同时下架
--   该活动"，一步完成"举报处理 + 移除违规内容"（见
--   docs/04_Development/Apple-UGC-Compliance-Review.md 第五节）。
--
-- 关于"下架"对应哪个字段——先读代码，不是直接假设：
--   activities 表同时有 status（open/full/cancelled/ended）和 deleted_at
--   两个字段（见 20260815042354_create_go_together_activities_schema.sql），
--   但检查现有实现后确认"下架"应该走 status = 'cancelled'，不是
--   deleted_at：
--     1. 发起人自己取消活动的现有实现（src/repositories/
--        activities-repository.ts 的 cancelActivity()）就是把 status 改成
--        'cancelled'，deleted_at 从头到尾没有被任何代码路径设置过。
--     2. activities_select_public 这条 RLS（`using (deleted_at is null and
--        status <> 'cancelled')`）已经把 status = 'cancelled' 单独列为
--        一个独立的"从公开列表消失"条件，不依赖 deleted_at——设置 status
--        为 'cancelled' 本身就已经完整达到"从所有人的公开视图里移除"这个
--        下架效果，不需要再额外设置 deleted_at。
--   所以管理员下架直接复用同一个字段（status = 'cancelled'），跟发起人
--   自己取消是同一个最终状态，只是多了"任何管理员都能触发、且原子写一条
--   审计日志"这两点。
--
-- 关于要不要复用 cancelActivity 现有的实现——先读代码，不是直接假设：
--   cancelActivity() 不是 security definer 函数，是前端直接
--   `.from("activities").update({status: "cancelled"}).eq("id", ...)`，
--   靠 activities_update_own 这条 RLS（`organizer_id = auth.uid()`）授权，
--   RLS 本身没有 is_admin() 例外，也没有任何原子写审计日志的机制（一条纯
--   UPDATE 语句做不到"顺带插入一行 moderation_actions"这种原子性，除非用
--   触发器，这里不引入触发器，跟 delete_post/delete_comment 保持同一种
--   "security definer 函数内部一次性完成状态变更 + 审计日志"的模式）。
--   因此这次不是"复用一个已有的 security definer 函数、加一个 is_admin()
--   分支"（那种模式只适用于本来就已经是 security definer 函数的场景，比如
--   之前 is_blocked_pair→is_blocked_with 那次），而是新建一个独立的
--   admin_cancel_activity() 函数，用法上完全平行于 delete_post/
--   delete_comment，不去改 cancelActivity()/activities_update_own 本身——
--   发起人自助取消这条现有路径继续保持不变，两条路径分别走各自的授权
--   （organizer_id = auth.uid() vs is_admin()），互不干扰，任务卡也明确
--   "禁止修改组织者自己取消活动的现有前端入口"。
--
-- 影响哪些表：
--   不新建表。新增一个 security definer 函数 public.admin_cancel_activity
--   (uuid, text)。moderation_actions_action_type_check 这条约束再放宽一次
--   （上一份迁移 20260823030000 刚加过 'delete_comment'，这次在此基础上
--   再加 'cancel_activity'，跟 restrict_user/suspend_user 是同一个
--   verb_noun 命名风格，不复用 'archive_post'——理由跟上一份迁移里说明
--   'delete_comment' 不复用 'archive_post' 完全一致：target_type 不同，
--   底层字段/表也不同）。
--
-- 是否影响现有数据：
--   不影响，只新增函数、放宽约束允许值，不改任何现有行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.moderation_actions drop constraint moderation_actions_action_type_check;
alter table public.moderation_actions add constraint moderation_actions_action_type_check
  check (action_type in (
    'approve_post', 'reject_post', 'archive_post', 'restore_post',
    'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report',
    'delete_comment', 'cancel_activity'
  ));

create or replace function public.admin_cancel_activity(
  target_activity_id uuid,
  cancel_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(both from cancel_reason);
begin
  if not public.is_admin() then
    raise exception 'only admins can cancel activities';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'cancel_reason is required';
  end if;

  -- 只处理当前还不是 cancelled 状态的活动，避免对一条已经取消的活动重复
  -- "下架"、重复记一遍审计日志——跟 delete_post/delete_comment 的
  -- "deleted_at is null" 防重复判断是同一个思路，这里换成对应 status
  -- 字段的等价条件。'ended'（已结束）状态的活动理论上也能被下架（比如
  -- 活动结束后才被举报、查实确实违规），这里不额外限制只能下架 open/full
  -- 状态——跟发起人自助取消不同，那边是 UI 层只在 open/full 时才展示
  -- 入口（见 activities-repository.ts 里 cancelActivity 的注释），管理员
  -- 处理举报的场景没有这个限制的必要，被举报的活动可能是任何状态。
  update public.activities
  set status = 'cancelled'
  where id = target_activity_id
    and status <> 'cancelled';

  if not found then
    raise exception 'activity % is already cancelled (or does not exist)', target_activity_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'cancel_activity', 'activity', target_activity_id, v_reason);
end;
$$;

revoke execute on function public.admin_cancel_activity(uuid, text) from public;
grant execute on function public.admin_cancel_activity(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚前必须确认
-- moderation_actions 表里没有 action_type = 'cancel_activity' 的行，否则
-- 加不回上一版约束）：
--
-- revoke execute on function public.admin_cancel_activity(uuid, text) from authenticated;
-- drop function if exists public.admin_cancel_activity(uuid, text);
--
-- alter table public.moderation_actions drop constraint if exists moderation_actions_action_type_check;
-- alter table public.moderation_actions add constraint moderation_actions_action_type_check
--   check (action_type in (
--     'approve_post', 'reject_post', 'archive_post', 'restore_post',
--     'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report',
--     'delete_comment'
--   ));
