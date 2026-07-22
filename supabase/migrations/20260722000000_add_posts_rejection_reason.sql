-- Migration: add posts.rejection_reason, wire it into approve_post/reject_post,
-- let authors clear (but not forge) it via direct UPDATE
--
-- 为什么改：
--   "我的发布管理页"要在帖子卡片上展示"审核未通过"的具体原因。这个原因
--   目前只写在 moderation_actions.note 里（reject_post() 写入），而
--   moderation_actions 的 SELECT 策略是纯管理员专用（见
--   supabase/migrations/20260717000200_admin_moderation_backend.sql 的
--   moderation_actions_select_admin），作者读不到自己帖子被拒的原因。
--
--   这次决定不开放 moderation_actions 给作者读（会连带暴露审核人身份、
--   以及一条帖子完整的历史处理记录，不只是"最近一次驳回原因"这一个值），
--   改成在 posts 表上冗余一份最新的驳回原因，作者通过已有的
--   posts_select_public_or_own_or_admin 策略就能直接读到，不需要新的
--   SELECT 权限。
--
-- 影响哪些表：
--   - public.posts：新增 rejection_reason 列。
--   - 重新定义 public.approve_post() / public.reject_post() 两个已有的
--     security definer 函数（只在原有逻辑上加一步"顺带维护
--     rejection_reason"，审核通过/驳回的核心逻辑不变）。
--   - 重建 posts 表上的 posts_update_own_or_admin 这一条 UPDATE 策略。
--
-- 是否影响现有数据：
--   现有 posts 行的 rejection_reason 一律是 null（新列，默认值 null）。
--   历史上已经被驳回过的帖子，驳回原因在 moderation_actions 里其实是有
--   记录的，但这次不做回填——回填需要"取每个帖子最新一条 reject_post
--   记录的 note"这种一次性数据迁移，属于额外的数据修复工作，不是这个
--   功能本身需要的前置条件（旧的驳回原因作者本来就一直读不到，不属于
--   "这次改动导致的数据丢失"，只是"这次没有顺带把历史空白补上"）。如果
--   之后需要回填历史数据，可以单独再做一次性脚本，不放在这份迁移里。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 关于 posts_update_own_or_admin 这次怎么改（这是这份迁移里最需要说明的
-- 部分）：
--
--   目标："重新提交审核"（resubmitPost，走普通 RLS 直接 UPDATE，不是新
--   函数）要能把 rejection_reason 清空成 null，但不能让作者通过直接
--   UPDATE 把这一列改成任意其它文本——这一列"有意义的内容"只应该由
--   reject_post() 这个 security definer 函数写入，直接 UPDATE 这条路径
--   只被允许"清空"这一种操作。
--
--   实现方式：作者分支的 with check 加一条新的 and 子句：
--     rejection_reason is null
--     or rejection_reason is not distinct from (
--       select p.rejection_reason from public.posts p where p.id = posts.id
--     )
--   拆开看这个 or 的两支分别放行什么：
--     - 第一支 `rejection_reason is null`：新值是 null 就直接放行——覆盖
--       "本来就是 null、这次也没动它"和"这次要把它清空"两种情况，不需要
--       跟旧值比较。
--     - 第二支 `is not distinct from 旧值`：新值等于当前存的值（包括都是
--       null，用 is not distinct from 做空值安全比较，和当初锁
--       posts.deleted_at 时用的是同一个写法）——覆盖"作者在编辑标题/描述
--       等其它字段，根本没碰这一列，PostgREST 没把它放进这次 UPDATE 的
--       SET 列表里，新值自动等于旧值"这种最常见的情况。
--   两支合起来挡住的唯一情况是："新值非空，且新值不等于当前存的值"——
--   也就是"伪造/篡改成一段新文本"，这正是要挡的。
--
--   没有改管理员分支：管理员分支现在的 with check 是"is_admin() 为真，
--   且 status/deleted_at 跟当前值一致"，除这两列外的所有字段管理员直接
--   UPDATE 都是完全放开的（title/description/category_id 等都可以直接
--   改），这是这张表已经确立、文档化过的模型（见
--   20260717000600_lock_posts_deleted_at_admin_direct_update.sql 的
--   说明）。rejection_reason 只是这个模型下又一个"字段级放开"的普通列，
--   不主动收紧，跟其它字段待遇一致；管理员真正要设置"有意义"的驳回原因
--   还是要走 reject_post()，这次改动只是让这个函数顺手多维护一列，
--   没有新增管理员能绕过审计日志的入口。

alter table public.posts
  add column rejection_reason text null default null;

-- approve_post：审核通过时清空 rejection_reason，避免展示过期的驳回
-- 原因（一个帖子被驳回过、作者修改后重新提交、这次审核通过，如果不清空，
-- 页面上会出现"状态是已通过，但还挂着一条旧的驳回原因"这种矛盾状态）。
create or replace function public.approve_post(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can approve posts';
  end if;

  update public.posts
  set status = 'approved',
      rejection_reason = null
  where id = target_post_id
    and status = 'pending';

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'approve_post', 'post', target_post_id);
end;
$$;

-- reject_post：驳回时把同一个 v_note 顺带写进 posts.rejection_reason，
-- moderation_actions 里那条记录（供管理员审计用，含完整历史）不变。
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
begin
  if not public.is_admin() then
    raise exception 'only admins can reject posts';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'rejection_note is required';
  end if;

  update public.posts
  set status = 'rejected',
      rejection_reason = v_note
  where id = target_post_id
    and status = 'pending';

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'reject_post', 'post', target_post_id, v_note);
end;
$$;

-- posts_update_own_or_admin：作者分支加一条 rejection_reason 只能清空、
-- 不能伪造的限制，说明见上面的大段注释。
drop policy if exists posts_update_own_or_admin on public.posts;

create policy posts_update_own_or_admin
  on public.posts
  for update
  to authenticated
  using (
    (author_id = auth.uid() and deleted_at is null)
    or public.is_admin()
  )
  with check (
    (
      public.is_admin()
      and status = (select p.status from public.posts p where p.id = posts.id)
      and deleted_at is not distinct from (select p.deleted_at from public.posts p where p.id = posts.id)
    )
    or (
      author_id = (select p.author_id from public.posts p where p.id = posts.id)
      and (
        status = (select p.status from public.posts p where p.id = posts.id)
        or status <> 'approved'
      )
      and view_count = (select p.view_count from public.posts p where p.id = posts.id)
      and favorite_count = (select p.favorite_count from public.posts p where p.id = posts.id)
      and (
        rejection_reason is null
        or rejection_reason is not distinct from (
          select p.rejection_reason from public.posts p where p.id = posts.id
        )
      )
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行，回滚成这份迁移之前的
-- 定义）：
--
-- drop policy if exists posts_update_own_or_admin on public.posts;
-- create policy posts_update_own_or_admin
--   on public.posts
--   for update
--   to authenticated
--   using (
--     (author_id = auth.uid() and deleted_at is null)
--     or public.is_admin()
--   )
--   with check (
--     (
--       public.is_admin()
--       and status = (select p.status from public.posts p where p.id = posts.id)
--       and deleted_at is not distinct from (select p.deleted_at from public.posts p where p.id = posts.id)
--     )
--     or (
--       author_id = (select p.author_id from public.posts p where p.id = posts.id)
--       and (
--         status = (select p.status from public.posts p where p.id = posts.id)
--         or status <> 'approved'
--       )
--       and view_count = (select p.view_count from public.posts p where p.id = posts.id)
--       and favorite_count = (select p.favorite_count from public.posts p where p.id = posts.id)
--     )
--   );
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
--
-- alter table public.posts drop column rejection_reason;
