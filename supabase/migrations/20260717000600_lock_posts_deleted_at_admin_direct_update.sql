-- Migration: block direct admin deleted_at changes on posts, close the last gap
--
-- 为什么改：
--   跟上次锁 status（20260717000400_lock_posts_status_admin_direct_
--   update.sql）是同一个口子：delete_post() 函数已经存在，但
--   posts_update_own_or_admin 的管理员分支一直没锁 deleted_at，管理员
--   理论上还是能绕过 delete_post()、直接 UPDATE posts.deleted_at，跳过
--   moderation_actions 里 archive_post 那条日志。这份迁移把这最后一个
--   口子也堵上：管理员分支的 with check 现在同时要求 status 和
--   deleted_at 都必须跟当前存的值一致，删除/恢复帖子（deleted_at 相关
--   的所有变更）之后只能走 delete_post()（以及以后如果做 restore_post()
--   函数的话）。
--
-- 影响哪些表：
--   不新建表，只重建 public.posts 上的 posts_update_own_or_admin 这一条
--   UPDATE 策略。posts 表本身、以及上次锁 status 的那份迁移都已经推送
--   生效，历史迁移不改写，这份新迁移在它们之上做修正，用
--   drop policy if exists + create policy，不管之前的迁移到底有没有
--   被完整应用过都能安全重复执行。
--
-- 是否影响现有数据：
--   不影响任何数据，只改策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- deleted_at 允许为空，跟当前值比对不能直接用 `=`（两边都是 null 时
-- `null = null` 结果是 null，不是 true，会把"没有改动 deleted_at 的
-- 正常更新"也误判成不满足 with check），要用 `is not distinct from`
-- 做空值安全比较——跟当初 reports_update_admin_only 锁 description 字段
-- 时用的是同一个道理。
--
-- delete_post()（以及未来的 restore_post()）是 security definer 函数，
-- 属主拥有 posts 表、天然绕过这条策略，不受这次改动影响。
--
-- 这次改动之后，管理员通过直接 UPDATE（不经过任何 security definer
-- 函数）还能做什么、不能做什么：
--
--   还能做：
--     - 对任何帖子（含未审核、已软删除的）发起 UPDATE（using 子句没有
--       变，is_admin() 为真就能选中任意一行）。
--     - 直接修改 title / description / price_amount / category_id /
--       location_id / contact_method / contact_value 等除 status 和
--       deleted_at 以外的任意字段。
--
--   不能再做：
--     - 直接把 status 改成任何新值（上次已经锁的，这次没变）。
--     - 直接设置或清除 deleted_at——不管是"删除"（设成非空）还是
--       "恢复"（清成 null），只要 deleted_at 的值发生变化，这条直接
--       UPDATE 就会被 with check 拒绝。
--
--   到这里，posts 表的管理员权限模型统一成：字段级完全放开，只有
--   status 和 deleted_at 这两个跟审核流程直接相关的字段必须走带审计
--   日志的 security definer 函数，不再有"合法但不记日志"的操作路径。

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
      and deleted_at is not distinct from (
        select p.deleted_at from public.posts p where p.id = posts.id
      )
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

-- 回滚方案（默认不执行，会重新放开管理员直接改 deleted_at 的入口，需要
-- 人工确认后单独运行，回滚成 20260717000400 迁移里的定义）：
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
