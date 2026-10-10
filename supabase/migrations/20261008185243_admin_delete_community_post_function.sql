-- 补录：这条 migration 已经在 2026-10-08 直接应用到线上项目
-- （supabase_migrations.schema_migrations 里 version = 20261008185243，
-- name = admin_delete_community_post_function），但当时没有把文件提交进仓库，
-- 导致仓库和线上不一致（supabase db push 会报远端有本地没有的 migration）。
-- 下面的 SQL 逐字取自线上 schema_migrations.statements，只加了这段注释，
-- 不改任何语句——线上已经执行过，这个文件只是让仓库重新和线上对齐。
--
-- 内容：管理员强制删除社区帖子（软删除 deleted_at）的 security definer 函数，
-- 并把 'delete_community_post' 加进 moderation_actions.action_type 的 check 约束。
-- 前端当时并没有接上这个函数（阶段七的前端部分从未实现），见后续
-- 20261010013000_admin_archive_community_post_and_notify.sql。

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
