-- Migration: 管理员删除违规评论
--
-- 为什么改：
--   UGC 安全功能补齐任务卡 4——管理员处理评论举报时，需要能像现在处理帖子
--   举报一样勾选"同时删除该评论"，一步完成"举报处理 + 移除违规内容"（见
--   docs/04_Development/Apple-UGC-Compliance-Review.md 第五节）。评论的软
--   删除目前只有 comments_delete_own 这一条 UPDATE 策略（见
--   20260804000000_create_comments_table.sql，被
--   20260805000000_fix_comments_insert_delete_infinite_recursion.sql 改过
--   一次），硬编码只放行 `user_id = auth.uid()`，管理员现在完全没有路径能
--   软删除别人的评论。
--
--   照抄 delete_post 的模式（见 20260717000500_delete_post_function.sql）：
--   新增一个 security definer 函数，校验 is_admin() + 必填删除原因，软删除
--   目标评论（设置 deleted_at），原子写一条 moderation_actions 记录。
--
-- 影响哪些表：
--   不新建表。新增一个 security definer 函数 public.delete_comment(uuid,
--   text)。另外 moderation_actions_action_type_check 这条约束需要放宽——
--   现有取值（approve_post/reject_post/archive_post/restore_post/
--   restrict_user/suspend_user/resolve_report/dismiss_report，见
--   20260717000200_admin_moderation_backend.sql）里没有一个能表达"删除
--   评论"，新增 'delete_comment' 这个取值（跟 target_type = 'comment'
--   配对），命名沿用现有 verb_noun 风格（跟 restrict_user/suspend_user 一致），
--   不复用 archive_post——那个值语义上专指"帖子"，评论是完全不同的表/
--   完全不同的软删除字段，混用同一个 action_type 会让审计日志的
--   target_type 和 action_type 对不上。
--
-- 是否需要 get_comment_snapshot()？
--   不需要。20260805000000 那次修复的是"RLS 策略里直接自引用查询
--   comments 表"触发的 42P17 递归——这个函数不是 RLS 策略，是一个
--   security definer 的 plpgsql 函数，内部直接 `update ... where id = ...`，
--   跟 delete_post() 完全一样的形状，本身不构成自引用递归，不需要绕道
--   走快照函数。
--
-- 是否影响现有数据：
--   不影响，只新增函数、放宽一条 check 约束的允许值集合，不改任何现有行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.moderation_actions drop constraint moderation_actions_action_type_check;
alter table public.moderation_actions add constraint moderation_actions_action_type_check
  check (action_type in (
    'approve_post', 'reject_post', 'archive_post', 'restore_post',
    'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report',
    'delete_comment'
  ));

create or replace function public.delete_comment(
  target_comment_id uuid,
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
    raise exception 'only admins can delete comments';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'delete_reason is required';
  end if;

  -- 只处理还没被删除过的评论（deleted_at is null）——跟 delete_post 同一个
  -- 理由，避免同一条评论被重复"删除"、重复记一遍审计日志。已软删除的评论
  -- 会被这条 where 条件排除，not found 分支会报错。
  update public.comments
  set deleted_at = now()
  where id = target_comment_id
    and deleted_at is null;

  if not found then
    raise exception 'comment % is already deleted (or does not exist)', target_comment_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delete_comment', 'comment', target_comment_id, v_reason);
end;
$$;

revoke execute on function public.delete_comment(uuid, text) from public;
grant execute on function public.delete_comment(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚前必须确认
-- moderation_actions 表里没有 action_type = 'delete_comment' 的行，否则
-- 加不回旧约束）：
--
-- revoke execute on function public.delete_comment(uuid, text) from authenticated;
-- drop function if exists public.delete_comment(uuid, text);
--
-- alter table public.moderation_actions drop constraint if exists moderation_actions_action_type_check;
-- alter table public.moderation_actions add constraint moderation_actions_action_type_check
--   check (action_type in (
--     'approve_post', 'reject_post', 'archive_post', 'restore_post',
--     'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report'
--   ));
