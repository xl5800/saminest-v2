-- Migration: 管理员强制删除社区帖子（admin_delete_community_post）
-- 社区功能阶段七
--
-- 为什么改：
--   community_posts_update_own_or_admin 这条 UPDATE 策略（见
--   20261008032102_create_community_core_tables.sql）的管理员分支要求
--   status / deleted_at 必须跟 get_community_post_snapshot() 查出来的原值
--   完全一致才允许通过，也就是说管理员今天没有任何合法路径可以改一条
--   社区帖子的 deleted_at。跟 posts/activities 当年的设计是同一个思路：
--   管理员的删除操作不走普通 RLS 允许的 UPDATE，必须走一个专门的、带审计
--   日志的 security definer 函数。阶段四（举报社区帖子）当时明确把"举报
--   处理表单上同时删除该社区帖子"排除在外，这是补上这一条。
--
-- 只做"删除"，不做"下架（archived 状态）"：
--   community_posts.status 虽然允许 'archived'，但社区帖子目前既没有"全部
--   社区帖子"的管理列表页能展示已下架的行，作者的"我的社区帖子"页也没有
--   重新上架入口——引入管理员下架会造成一个作者看得到、却既不能编辑也没有
--   恢复按钮的死状态。删除（deleted_at）这条路阶段六作者自助删帖已经在用
--   同一个字段，管理员复用同一个字段、同一套语义，跟 delete_post /
--   admin_delete_activity 是同一个模式（作者自己删一条授权路径，管理员走
--   security definer 函数再一条独立授权路径，互不冲突）。
--
-- 关于 moderation_actions 的约束（写这份迁移前核实过完整历史）：
--   - target_type：建表迁移（20260717000200_admin_moderation_backend.sql）
--     明确"按字面不加约束"，至今没有任何迁移给它加过 check，不需要动。
--   - action_type：有 check 约束 moderation_actions_action_type_check，
--     而且被多份迁移反复 drop + 重建过（20260717000700 → 20260824233427 →
--     20260824233434 → 20260921090000 → 20260929000000）。这次必须在
--     **最新一版**（20260929000000_admin_archive_post_function.sql 里的 13
--     个取值，含 'delist_post'）的基础上加一个 'delete_community_post'，
--     不能照抄更早的版本——否则会静默把后面某次新增的取值（比如
--     'delist_post'）从白名单里丢掉，让对应的管理员功能直接撞约束报错
--     （20260921090000 迁移顶部记录过的 'restore_user' 事故就是这么来的）。
--   - 新增的 action_type 取名 'delete_community_post'，不复用 'archive_post'
--     （delete_post 当年借用了它）、也不复用 'delete_comment'/'delete_activity'：
--     target_type 不同（这次是 'community_post'），审计日志里需要能一眼
--     区分"删的是普通帖子还是社区帖子"。
--
-- 关于权限：
--   不新开/不改任何 RLS 策略。这是一个 security definer 函数，只处理
--   "删除"这个写操作。grant/revoke 按两次线上事故（20260818163106、
--   20260914051412）之后确立的写法：显式 `revoke ... from public, anon`，
--   这个项目的 Supabase 实例会给新建函数默认单独授予 anon EXECUTE，只
--   revoke public 不会连带收回；调用方是否真的是管理员由函数体里的
--   is_admin() 检查兜底（纵深防御，不只靠前端不显示入口）。
--
-- 是否影响现有数据：
--   不影响，只新增函数、放宽约束允许值，不改任何现有行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.moderation_actions
  drop constraint moderation_actions_action_type_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
  check (
    action_type in (
      'approve_post',
      'reject_post',
      'archive_post',
      'restore_post',
      'restrict_user',
      'suspend_user',
      'restore_user',
      'resolve_report',
      'dismiss_report',
      'delete_comment',
      'cancel_activity',
      'delete_activity',
      'delist_post',
      'delete_community_post'
    )
  );

create or replace function public.admin_delete_community_post(
  target_community_post_id uuid,
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
    raise exception 'only admins can delete community posts';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'delete_reason is required';
  end if;

  -- 只处理还没被删除过的社区帖子（deleted_at is null），不限制 status——
  -- 跟 delete_post / admin_delete_activity 一样，被举报的内容可能是任何
  -- 状态，不应该要求"先下架才能删"。已经被删过的（不管是作者自己删的
  -- 还是管理员之前删过）会被 where 条件排除，not found 分支报错，避免
  -- 重复删除、重复记一条审计日志。
  update public.community_posts
  set deleted_at = now()
  where id = target_community_post_id
    and deleted_at is null;

  if not found then
    raise exception 'community post % is already deleted (or does not exist)', target_community_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delete_community_post', 'community_post', target_community_post_id, v_reason);
end;
$$;

revoke execute on function public.admin_delete_community_post(uuid, text) from public, anon;
grant execute on function public.admin_delete_community_post(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚前必须确认
-- moderation_actions 表里没有 action_type = 'delete_community_post' 的行，
-- 否则加不回上一版约束）：
--
-- revoke execute on function public.admin_delete_community_post(uuid, text) from authenticated;
-- drop function if exists public.admin_delete_community_post(uuid, text);
--
-- alter table public.moderation_actions drop constraint if exists moderation_actions_action_type_check;
-- alter table public.moderation_actions add constraint moderation_actions_action_type_check
--   check (
--     action_type in (
--       'approve_post', 'reject_post', 'archive_post', 'restore_post',
--       'restrict_user', 'suspend_user', 'restore_user', 'resolve_report',
--       'dismiss_report', 'delete_comment', 'cancel_activity', 'delete_activity',
--       'delist_post'
--     )
--   );
