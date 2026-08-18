-- Migration: approve_post/reject_post 接入系统通知
--
-- 为什么改：
--   帖子审核通过/拒绝现在完全没有任何主动通知，用户只能自己去"我的帖子"
--   查看状态——这是这次系统通知功能要解决的第一批场景（跟用户确认过的
--   范围，账号状态变更那个场景放第二批）。
--
-- 影响哪些表：
--   不新建表、不加列。重新定义 approve_post(uuid) / reject_post(uuid, text)
--   两个函数，在原有逻辑基础上，状态更新成功之后调用 notify_user()
--   发一条系统通知。函数签名不变，调用方（admin-repository 那一层）不
--   需要跟着改。
--
-- 是否影响现有数据：
--   不影响，只改函数定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行，
--   回滚内容是 20260717000300_admin_moderation_actions_functions.sql 里
--   这两个函数原本的定义，逐字照抄）。
--
-- 链接目标的选择：
--   审核通过 -> 链接到 /post/{id}，这时帖子已经是 approved，公开可见。
--   审核拒绝 -> 链接到 /my-posts，不链接到 /post/{id}——被拒绝的帖子按
--   posts_select_public_or_own_or_admin 这条 RLS，除了作者本人和管理员
--   谁都看不到，但 post-detail-page.tsx 现在故意把"帖子不存在"和"没权限
--   看到"渲染成同一句"帖子未找到"（避免泄露信息，见该文件顶部注释），
--   如果链接到 /post/{id}，作者点进去看到的会是一句语焉不详的"帖子未
--   找到"，体验很差；/my-posts 已经在展示 rejection_reason，链接过去
--   用户能直接看到具体拒绝原因，更有用。

create or replace function public.approve_post(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'only admins can approve posts';
  end if;

  update public.posts
  set status = 'approved'
  where id = target_post_id
    and status = 'pending'
  returning author_id, title into v_author_id, v_title;

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'approve_post', 'post', target_post_id);

  perform public.notify_user(
    v_author_id,
    '帖子审核通过',
    format('你的帖子《%s》审核通过，现在可以在首页看到啦。', v_title),
    format('/post/%s', target_post_id)
  );
end;
$$;

create or replace function public.reject_post(
  target_post_id uuid,
  rejection_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from rejection_note);
  v_author_id uuid;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'only admins can reject posts';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'rejection_note is required';
  end if;

  update public.posts
  set status = 'rejected'
  where id = target_post_id
    and status = 'pending'
  returning author_id, title into v_author_id, v_title;

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'reject_post', 'post', target_post_id, v_note);

  perform public.notify_user(
    v_author_id,
    '帖子审核未通过',
    format('你的帖子《%s》未通过审核：%s', v_title, v_note),
    '/my-posts'
  );
end;
$$;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- create or replace function public.approve_post(target_post_id uuid)
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if not public.is_admin() then
--     raise exception 'only admins can approve posts';
--   end if;
--
--   update public.posts
--   set status = 'approved'
--   where id = target_post_id
--     and status = 'pending';
--
--   if not found then
--     raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
--   end if;
--
--   insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
--   values (auth.uid(), 'approve_post', 'post', target_post_id);
-- end;
-- $$;
--
-- create or replace function public.reject_post(
--   target_post_id uuid,
--   rejection_note text
-- )
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_note text := trim(both from rejection_note);
-- begin
--   if not public.is_admin() then
--     raise exception 'only admins can reject posts';
--   end if;
--
--   if v_note is null or v_note = '' then
--     raise exception 'rejection_note is required';
--   end if;
--
--   update public.posts
--   set status = 'rejected'
--   where id = target_post_id
--     and status = 'pending';
--
--   if not found then
--     raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
--   end if;
--
--   insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
--   values (auth.uid(), 'reject_post', 'post', target_post_id, v_note);
-- end;
-- $$;
