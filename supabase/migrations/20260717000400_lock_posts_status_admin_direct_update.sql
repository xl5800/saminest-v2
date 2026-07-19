-- Migration: block direct admin status changes on posts, keep deleted_at open
--
-- 为什么改：
--   跟 reports 表这次做的收紧是同一个思路：现在 approve_post()/reject_post()
--   这两个 security definer 函数是"改 posts.status + 记 moderation_actions"
--   唯一保证原子的入口。但 posts_update_own_or_admin（见
--   supabase/migrations/20260715220300_create_posts_table.sql）的管理员
--   分支一直是完全放开的（with check 里 `is_admin()` 为真就直接放行，
--   不检查任何字段），管理员理论上还是可以绕开这两个函数、直接对
--   posts 发一次 UPDATE 把 status 改成 approved/rejected，跳过审计日志。
--   这份迁移把这个口子堵上：管理员分支的 with check 现在要求"如果是
--   走这条策略的直接 UPDATE，status 必须保持不变"，逼审核动作只能走
--   approve_post()/reject_post()。
--
--   但用户特别强调：软删除（设置 deleted_at，下一步"删除帖子"任务要用）
--   不能被这次收紧连带锁死——这份迁移只锁 status 这一列，deleted_at
--   和其它字段管理员依然可以通过直接 UPDATE 自由修改。
--
--   approve_post()/reject_post() 是 security definer 函数，属主拥有
--   posts 表、天然绕过 posts 自身的 RLS，不受这条策略任何改动的影响——
--   收紧的是"直接 UPDATE"这条路径，不影响这两个函数内部的 UPDATE。
--
-- 影响哪些表：
--   不新建表，只重建 public.posts 上的 posts_update_own_or_admin 这一条
--   UPDATE 策略。posts 表本身（20260715220300 迁移）已经被推送生效，
--   历史迁移不改写，这份新迁移在它之上做修正，用
--   drop policy if exists + create policy，不管这份迁移之前有没有被
--   部分应用过都能安全重复执行。
--
-- 是否影响现有数据：
--   不影响任何数据，只改策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 这次改动之后，管理员通过直接 UPDATE（不经过 approve_post/reject_post）
-- 还能做什么、不能做什么：
--
--   还能做：
--     - 对任何帖子（含未审核、已软删除的）发起 UPDATE（using 子句没有变，
--       is_admin() 为真就能选中任意一行）。
--     - 直接设置/清除 deleted_at（软删除或恢复）——不受这次改动影响，
--       这正是用户要求保留的能力，留给下一步"删除帖子"任务用。
--     - 直接修改 title / description / price_amount / category_id /
--       location_id / contact_method / contact_value 等除 status 以外
--       的任意字段。
--
--   不能再做：
--     - 直接把 status 改成任何新值（包括 approved / rejected，也包括
--       改成其它取值如 draft/archived/deleted）——with check 要求
--       status 必须跟当前存的值一致，任何"改 status"的直接 UPDATE
--       都会被这条策略拒绝，不管改成什么值。
--     - 审核帖子（通过/驳回）现在只能调用 approve_post(target_post_id) /
--       reject_post(target_post_id, rejection_note) 这两个函数，没有
--       别的入口。

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
    )
    or (
      author_id = (select p.author_id from public.posts p where p.id = posts.id)
      and (
        status = (select p.status from public.posts p where p.id = posts.id)
        or status <> 'approved'
      )
      and view_count = (select p.view_count from public.posts p where p.id = posts.id)
      and favorite_count = (select p.favorite_count from public.posts p where p.id = posts.id)
    )
  );

-- 回滚方案（默认不执行，会重新放开管理员直接改 status 的入口，需要人工
-- 确认后单独运行，回滚成 20260715220300 迁移里原本的定义）：
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
--     public.is_admin()
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
