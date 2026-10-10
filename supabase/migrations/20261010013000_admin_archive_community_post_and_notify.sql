-- 管理后台「全部帖子 → 社区帖子」：管理员下架 / 删除社区帖子，并通知发帖人。
--
-- 1. moderation_actions.action_type 新增 'delist_community_post'（下架社区帖子）。
--    约束整体重建，列表 = 20261008185243 里的完整列表 + 新值，一个都不少。
--
-- 2. 新函数 admin_archive_community_post(target_community_post_id, archive_note)：
--    照抄 admin_archive_post（普通帖子下架）的写法——security definer，先检查
--    is_admin()，原因必填，把 status 改成 'archived'（community_posts.status 的
--    check 约束本来就允许 'archived'），写一条 moderation_actions 日志。
--    管理员不能直接 UPDATE community_posts.status：
--    community_posts_update_own_or_admin 的 with check 要求管理员分支下 status
--    和 deleted_at 都保持原值（20261008032102），所以必须走 security definer 函数。
--    产品决定：下架不可恢复，所以不提供"恢复上架"函数。已经下架或已删除的帖子
--    排除在 where 条件里，避免重复下架、重复记日志、重复通知。
--    下架后：公开 SELECT 策略只放行 status = 'approved'，帖子自动从首页、社区页、
--    搜索、"今日 N 个新帖子"里消失；作者本人仍能在"我的社区发帖"里看到它。
--
-- 3. admin_delete_community_post 重新定义：逻辑跟 20261008185243 完全一样，只在
--    最后加一步通知发帖人。用 returning author_id 拿到作者，不额外查一次表。
--
-- 通知：两个函数都通过 notify_user（系统通知会话，见 20260818162736）给发帖人
-- 发一条消息，带上管理员填写的原因，链接到 /my-community-posts。notify_user 本身
-- 只授权给 postgres / service_role，这里在 security definer 函数内部调用（函数
-- 属主是 postgres），跟 approve_post / reject_post 调用它的方式一致。
-- 帖子没有标题时用正文前 20 个字代替，保证通知里能看出是哪条帖子。

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
      'delete_community_post',
      'delist_community_post'
    )
  );

create or replace function public.admin_archive_community_post(
  target_community_post_id uuid,
  archive_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from archive_note);
  v_author_id uuid;
  v_title text;
  v_body text;
begin
  if not public.is_admin() then
    raise exception 'only admins can archive community posts';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'archive_note is required';
  end if;

  update public.community_posts
  set status = 'archived'
  where id = target_community_post_id
    and status <> 'archived'
    and deleted_at is null
  returning author_id, title, body into v_author_id, v_title, v_body;

  if not found then
    raise exception 'community post % is already archived, deleted, or does not exist', target_community_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delist_community_post', 'community_post', target_community_post_id, v_note);

  perform public.notify_user(
    v_author_id,
    '社区帖子已被下架',
    format(
      '你的社区帖子《%s》已被管理员下架：%s',
      coalesce(nullif(trim(both from v_title), ''), left(v_body, 20)),
      v_note
    ),
    '/my-community-posts'
  );
end;
$$;

revoke execute on function public.admin_archive_community_post(uuid, text) from public, anon;
grant execute on function public.admin_archive_community_post(uuid, text) to authenticated;

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
  v_author_id uuid;
  v_title text;
  v_body text;
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
    and deleted_at is null
  returning author_id, title, body into v_author_id, v_title, v_body;

  if not found then
    raise exception 'community post % is already deleted (or does not exist)', target_community_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'delete_community_post', 'community_post', target_community_post_id, v_reason);

  perform public.notify_user(
    v_author_id,
    '社区帖子已被删除',
    format(
      '你的社区帖子《%s》已被管理员删除：%s',
      coalesce(nullif(trim(both from v_title), ''), left(v_body, 20)),
      v_reason
    ),
    '/my-community-posts'
  );
end;
$$;

revoke execute on function public.admin_delete_community_post(uuid, text) from public, anon;
grant execute on function public.admin_delete_community_post(uuid, text) to authenticated;
