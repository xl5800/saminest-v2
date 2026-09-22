-- Migration: 管理员真正删除活动——"全部帖子"管理页扩展成能管理所有内容
-- 任务卡
--
-- 为什么改：
--   管理员对"帖子"有两套入口：/admin/posts/all 页面主动浏览/删除任何帖子
--   （不需要先有人举报），以及举报处理表单里的"同时删除"。"找搭子"活动
--   只有后一套（必须先有用户举报过），管理员没法主动找到、处理没人举报
--   过的问题活动。这次把 /admin/posts/all 扩展成同时管理帖子和活动，
--   需要一个对称的"主动删除活动"入口。
--
--   "下架"（admin_cancel_activity，status 改成 'cancelled'）和"删除"
--   （这次新增，activities.deleted_at）两个操作都保留，不是互相替代：
--   下架适合"暂时不想让人看到"，删除是更重的操作，跟删帖子是同一个力度。
--   activities.deleted_at 这一列从 20260815042354_create_go_together_
--   activities_schema.sql 建表起就存在，但目前没有任何函数写过它——
--   UGC 安全功能补齐任务卡 4 当时特意选"下架"而不是"删除"，是因为当时
--   没有真正的软删除需求（见 admin_cancel_activity 那份迁移顶部对"下架
--   对应哪个字段"的说明），这次才第一次真正用上这一列。
--
-- 关于要不要复用 admin_cancel_activity 或改它——不复用、不改：
--   两个函数各自对应一个独立的字段（status vs deleted_at）、独立的业务
--   含义（暂时下架 vs 永久删除），跟 delete_post 之于 archive_post/
--   reject_post 是同一个"状态变更"和"软删除"分属两个函数、不合并成一个
--   带参数分支的函数"的既有模式。admin_cancel_activity 逐字不变。
--
-- 关于权限——不新开/不改任何 RLS 策略：
--   管理员读取所有活动（含 cancelled/其它任何状态）已经有
--   activities_select_admin 这条独立的 permissive SELECT 策略
--   （`using (is_admin())`，见 20260816192239_add_activities_select_
--   admin_policy.sql）覆盖，这条策略本身没有问题，是专门为管理员开的
--   独立策略，不是往一条"仅成员可见"策略上加例外（不是上一次修的那类
--   越权），可以放心复用。这次只需要一个 security definer 函数处理
--   "删除"这个写操作，删除是状态变更，不是新增一种读权限。
--
-- 影响哪些表/函数：
--   moderation_actions_action_type_check 约束加 'delete_activity'——跟
--   delete_comment 不复用 archive_post、cancel_activity 不复用
--   archive_post 是同一个理由：target_type 不同（这次是 'activity'，且
--   底层字段是 activities.deleted_at，不是 posts.deleted_at），需要一个
--   独立的 verb_noun 取值，不是复用 'archive_post' 或 'cancel_activity'。
--
--   顺带修正一个在读取这条约束的完整历史时发现的既有 bug：
--   20260717000700_account_status_enforcement.sql 当时把这条约束加到
--   包含 'restore_user'（set_account_status() 把账号状态改回 active 时
--   记的动作类型，见该迁移文件），但后来
--   20260824233427_admin_delete_comment_function.sql 重建这条约束时漏带
--   了 'restore_user'（大概率是照抄了一份更早、还没加 restore_user 的
--   版本，不是故意去掉），20260824233434_admin_cancel_activity_function.sql
--   在这个已经缺失的基础上继续新增 cancel_activity，一直没有人补回来。
--   实际影响：现在管理员把一个 restricted/suspended 账号恢复成 active
--   时，set_account_status() 内部 insert 的 action_type = 'restore_user'
--   会直接撞上这条 check 约束报错，"恢复账号"这个功能在当前代码库状态下
--   是坏的。这次因为要在同一条约束上做 drop + create，顺手把 restore_user
--   带回来，不需要为这一个已经发现的 bug 单独再开一份迁移（也没有办法
--   不带上它就先落地 delete_activity——两个都是要往同一条约束的允许值
--   列表里加东西，不重建这条约束加不成任何一个新值）。这不是这次任务卡
--   要求的范围，完工报告里会单独说明。
--
--   新增 public.admin_delete_activity(uuid, text)，逐字照抄 delete_post
--   的结构（校验 is_admin()、delete_reason 非空、按 id 更新
--   deleted_at、找不到符合条件的行时报错、原子写一条 moderation_actions
--   审计日志）。不限制 status——open/full/cancelled/ended 任何状态的活动
--   都能删，跟 delete_post 不限制 posts.status 是同一个考虑（被举报/需要
--   处理的活动可能是任何状态，不应该要求"先下架才能删"）。
--
--   grant/revoke 这次显式把 anon 也一起收回（`revoke ... from public,
--   anon`），不是只 `revoke ... from public`——delete_post/
--   admin_cancel_activity 当初都只写了 `revoke ... from public`，之前
--   20260818163106_fix_notify_user_anon_execute_leak.sql /
--   20260914051412_fix_activity_moderation_anon_execute_leak.sql 两次
--   线上事故都是同一个根因：这个项目的 Supabase 实例会给新建函数默认
--   单独授予 anon 角色 EXECUTE，`revoke ... from public` 不会连带收回
--   这个独立的 anon 授权。这次新函数直接按照两次事故修复后确立的正确
--   写法来，不重蹈同一个坑——但这不代表 delete_post/admin_cancel_activity
--   现在也有同样的问题去改它们，这次任务卡明确不碰这两个函数，是否需要
--   补一份类似的收紧迁移是另一个独立的任务，已经在完工报告里单独提出。
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
    'restrict_user', 'suspend_user', 'restore_user', 'resolve_report',
    'dismiss_report', 'delete_comment', 'cancel_activity', 'delete_activity'
  ));

create or replace function public.admin_delete_activity(
  target_activity_id uuid,
  delete_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(both from delete_reason);
begin
  if not public.is_admin() then
    raise exception 'only admins can delete activities';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'delete_reason is required';
  end if;

  -- 只处理还没被删除过的活动（deleted_at is null），不限制 status——
  -- open/full/cancelled/ended 都能删，跟 delete_post 不限制 posts.status
  -- 是同一个考虑，见上面的说明。
  update public.activities
  set deleted_at = now()
  where id = target_activity_id
    and deleted_at is null;

  if not found then
    raise exception 'activity % is already deleted (or does not exist)', target_activity_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delete_activity', 'activity', target_activity_id, v_reason);
end;
$$;

revoke execute on function public.admin_delete_activity(uuid, text) from public, anon;
grant execute on function public.admin_delete_activity(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚前必须确认
-- moderation_actions 表里没有 action_type = 'delete_activity' 的行，否则
-- 加不回上一版约束）：
--
-- revoke execute on function public.admin_delete_activity(uuid, text) from authenticated;
-- drop function if exists public.admin_delete_activity(uuid, text);
--
-- alter table public.moderation_actions drop constraint if exists moderation_actions_action_type_check;
-- alter table public.moderation_actions add constraint moderation_actions_action_type_check
--   check (action_type in (
--     'approve_post', 'reject_post', 'archive_post', 'restore_post',
--     'restrict_user', 'suspend_user', 'restore_user', 'resolve_report',
--     'dismiss_report', 'delete_comment', 'cancel_activity'
--   ));
