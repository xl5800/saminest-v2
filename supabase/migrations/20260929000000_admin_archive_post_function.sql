-- Handoff 方案 1a 功能改动清单第 7 项：管理后台「全部帖子」「举报处理」新增
-- 对帖子的「下架」操作（原版帖子只有删除，没有下架）。
--
-- 「下架」在语义上跟已有的作者自助下架（posts-repository.ts 的
-- archivePost()，status 改成 'archived'）是同一件事——帖子不再对外展示，
-- 但记录本身还留着，管理员之后仍能在「全部帖子」里看到并处理。所以这里
-- 复用同一个 status = 'archived' 值，不新增枚举值：posts_status_check
-- 已经允许 'archived'，公开列表（listApprovedPosts 等）已经天然把非
-- 'approved' 状态排除在外，复用现有值意味着不需要再去审计一遍所有按
-- status 过滤帖子的查询点。
--
-- 但作者自助下架和管理员下架是两条完全独立的授权路径，跟
-- admin_cancel_activity / cancelActivity（活动那边同样的模式，见
-- supabase/migrations/20260824233434_admin_cancel_activity_function.sql）
-- 完全一致的理由：author_id = auth.uid() 的直接 UPDATE vs is_admin() 的
-- security definer 函数，不共用同一个前端函数。而且
-- posts_update_own_or_admin 这条策略的管理员分支已经在
-- supabase/migrations/20260717000400_lock_posts_status_admin_direct_update.sql
-- 里被锁死成「管理员直接 UPDATE 不能改 status」，所以管理员下架帖子必须
-- 走一个新的 security definer 函数，不能像作者自助下架那样直接
-- .update({status:"archived"})。
--
-- 管理员下架需要记原因（README「所有需要原因的操作」+「下架原因灰底
-- 备注」），作者自助下架不需要（自己的选择，不需要向自己解释）——所以
-- 新增一列 archive_reason，跟 rejection_reason
-- （supabase/migrations/20260722000000_add_posts_rejection_reason.sql）
-- 是完全对称的模式：只在管理员下架时才有值，作者自助下架、批准、驳回都
-- 不动这一列。
--
-- 函数参数特意叫 archive_note，不叫 archive_reason——跟 reject_post 的
-- rejection_note / posts.rejection_reason 是同一个理由：参数名如果跟列名
-- 撞了，函数体里裸写列名容易被读成引用参数（这个具体场景在 plpgsql 里
-- 未必真的会报 ambiguous，但保持跟 rejection_note 一致的命名习惯，不去
-- 依赖“这次凑巧不会撞”）。

alter table public.posts
  add column archive_reason text null default null;

-- moderation_actions 的 action_type 白名单需要新增一个值。不能复用现有的
-- 'archive_post'——那个值已经被 delete_post()
-- （supabase/migrations/20260717000500_delete_post_function.sql）占用，
-- 语义其实是“删除”，只是当年建 moderation_actions 表时
-- （supabase/migrations/20260717000200_admin_moderation_backend.sql）
-- 预留的枚举值凑巧叫这个名字，delete_post 借用了它——继续借用只会让
-- 「下架」和「删除」两种审核日志混在一起，没法区分。这里新增一个专门的
-- 'delist_post' 值。
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
      'delist_post'
    )
  );

create or replace function public.admin_archive_post(
  target_post_id uuid,
  archive_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from archive_note);
begin
  if not public.is_admin() then
    raise exception 'only admins can archive posts';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'archive_note is required';
  end if;

  -- 跟 delete_post 一样不限制来源 status——待审核、已通过、已驳回的帖子
  -- 都能被下架；已经下架过的（status = 'archived'）或已经软删除
  -- （deleted_at is not null）的排除在 where 条件里，避免重复下架、重复
  -- 记一遍日志。
  update public.posts
  set status = 'archived',
      archived_at = now(),
      archive_reason = v_note
  where id = target_post_id
    and status <> 'archived'
    and deleted_at is null;

  if not found then
    raise exception 'post % is already archived, deleted, or does not exist', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delist_post', 'post', target_post_id, v_note);
end;
$$;

revoke all on function public.admin_archive_post(uuid, text) from public, anon;
grant execute on function public.admin_archive_post(uuid, text) to authenticated;

-- admin_list_posts() 原来只返回 id/title/created_at/status/author_name/
-- category_name（见
-- supabase/migrations/20260925050903_admin_list_functions_remove_admin_select_bypass.sql），
-- 「全部帖子」管理页要展示「驳回/下架原因灰底备注」（README 管理后台
-- 小节），需要把 rejection_reason 和这里新增的 archive_reason 也带出来。
-- Postgres 的 CREATE OR REPLACE FUNCTION 不允许给一个已存在的
-- RETURNS TABLE 函数改变返回列集合，所以这里先 drop 再重建。
drop function if exists public.admin_list_posts(text, uuid, text);

create function public.admin_list_posts(
  status_filter text default null,
  category_id_filter uuid default null,
  search_term text default null
)
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  status text,
  author_name text,
  category_name text,
  rejection_reason text,
  archive_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can list all posts';
  end if;

  return query
    select po.id, po.title, po.created_at, po.status,
           coalesce(pr.display_name, '未知用户') as author_name,
           coalesce(c.name_zh, '未知分类') as category_name,
           po.rejection_reason,
           po.archive_reason
    from public.posts po
    left join public.profiles pr on pr.id = po.author_id
    left join public.categories c on c.id = po.category_id
    where po.deleted_at is null
      and (status_filter is null or status_filter = '' or po.status = status_filter)
      and (category_id_filter is null or po.category_id = category_id_filter)
      and (
        search_term is null
        or search_term = ''
        or po.title ilike '%' || search_term || '%'
      )
    order by po.created_at desc;
end;
$$;

revoke all on function public.admin_list_posts(text, uuid, text) from public, anon;
grant execute on function public.admin_list_posts(text, uuid, text) to authenticated;
