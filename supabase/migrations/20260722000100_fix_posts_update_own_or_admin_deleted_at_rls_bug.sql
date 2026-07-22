-- Migration: fix a latent RLS bug that makes author-initiated soft-delete
-- (deleteMyPost) always fail
--
-- 为什么改：
--   实现"我的发布管理页"的删除功能时，用真实浏览器 + 真实数据库账号测试
--   deleteMyPost()，发现它 100% 必现失败，报 42501（"违反行级安全策略"）。
--   updatePost() / archivePost() / resubmitPost() 三个同样走
--   posts_update_own_or_admin 作者分支直接 UPDATE 的方法，用同一个账号、
--   同一条帖子实测，全部成功——差异只有一点：deleteMyPost() 是这四个里
--   唯一会把 deleted_at 从 null 改成非 null 的。
--
--   根因（已通过对照实验定位，不是猜测）：
--   posts_update_own_or_admin 作者分支的 with check 里，view_count /
--   favorite_count 这两个等值比较（没有 status 那种 `or status <>
--   'approved'` 式的短路出口）都是靠一个自引用子查询取"这一行现在存的
--   值"来比对：
--     view_count = (select p.view_count from public.posts p where p.id = posts.id)
--   这个子查询本身是一条普通 SELECT，要经过 posts 表自己的 SELECT 策略
--   （posts_select_public_or_own_or_admin）。当本次 UPDATE 恰好正在把
--   同一行的 deleted_at 从 null 改成 now() 时，这条子查询在同一条 UPDATE
--   语句内部看到的是"这一行当前（含本次修改中）的状态"，而 SELECT 策略
--   作者分支要求 `deleted_at is null`——这时候这一行在子查询眼里已经不
--   满足 `deleted_at is null`，子查询因此查不到任何行，返回 null。
--   `view_count = null` 求值结果是 null（不是 false，但在 with check 里
--   null 等同于拒绝），没有 or 出口兜底，整条 with check 直接判定失败，
--   跟"这一行到底属不属于当前用户"毫无关系，是一个纯粹的实现细节 bug。
--
--   影响范围：不只是这次的 deleteMyPost。任何"作者对自己帖子发起的直接
--   UPDATE、且这次 UPDATE 会把 deleted_at 从 null 改成非 null"的路径都会
--   被这个 bug 挡住——目前唯一这样用的就是 deleteMyPost，但这是策略本身
--   的缺陷，不是 deleteMyPost 这一个调用点该自己绕过的问题，需要在策略
--   层面修。
--
-- 影响哪些表：
--   不新建表。新增一个 security definer 辅助函数
--   public.get_post_snapshot()，重建 posts 表上的
--   posts_update_own_or_admin 这一条 UPDATE 策略。
--
-- 修法：
--   把"查这一行现在存的值"这部分逻辑从"直接自引用 SELECT（受 SELECT 策略
--   约束）"换成"一个 security definer 函数（绕开 SELECT 策略，只做一次
--   按主键的普通查询）"。这张表的属主不受 RLS 约束（建表时只
--   `enable row level security`，没有 `force row level security`），
--   所以 security definer 函数内部的 SELECT 完全不会再被
--   `deleted_at is null` 这类条件挡住，不管这次 UPDATE 是不是正在改
--   deleted_at 本身，都能查到这一行。admin 分支和作者分支涉及"跟当前存的
--   值比对"的地方（status/deleted_at/view_count/favorite_count/
--   rejection_reason）全部改成从这个函数取值，不再各自手写一遍自引用
--   子查询——顺便消除了原来五处几乎一样的 `select p.xxx from public.posts
--   p where p.id = posts.id` 重复写法。
--
--   语义完全不变：这个函数只是换了一种"拿到这一行当前存的值"的方式，
--   不改变任何一条 with check 分支实际在检查什么、放行什么、拒绝什么。
--
--   关于这个新函数本身的权限边界（这点必须显式处理，不能想当然）：
--   security definer 函数一旦绕开了表的 RLS，它自己就是一个新的、独立的
--   权限入口——如果只是单纯 `select * from posts where id = target_id`，
--   任何登录用户都可以不经过这条 UPDATE 策略、直接 `.rpc("get_post_
--   snapshot", { target_id: 任意帖子ID })` 调用它，绕过
--   posts_select_public_or_own_or_admin，读到任何人任何状态帖子的完整
--   字段（包括未审核/已下架/私密帖子的 contact_value 这类本来受保护的
--   信息）——这是新开的口子，必须堵上，不能因为"反正只是给策略内部用"就
--   省略调用者身份检查。
--
--   所以函数内部显式加了 `and (author_id = auth.uid() or public.is_admin())`
--   这条过滤：只有帖子作者本人或管理员能通过这个函数查到这一行，其他人
--   （包括未登录的 anon）调用会得到空结果，跟直接查 posts 表在"谁能看到
--   这一行"这件事上收紧到了刚好覆盖 posts_update_own_or_admin 的 using
--   子句已经允许的范围（using 子句本来就只让 author_id = auth.uid() 或
--   is_admin() 的行进入 with check 阶段），不多不少。
--
--   这条过滤不会重新引入本次要修的 bug：它比对的是 author_id（一个不会
--   随这次 UPDATE 变化、也不受其它 RLS 策略约束的普通列），不涉及
--   deleted_at，所以不管这次 UPDATE 是不是正在改 deleted_at，这条过滤都
--   能正确求值。
--
-- 是否影响现有数据：
--   不影响，只改函数/策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create or replace function public.get_post_snapshot(target_id uuid)
returns public.posts
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.posts
  where id = target_id
    and (author_id = auth.uid() or public.is_admin());
$$;

-- 显式收紧调用者范围（不是可有可无的装饰）：虽然函数内部已经有
-- author_id/is_admin() 过滤，多一层"谁能调用这个函数"的 grant 限制是
-- 纵深防御，也是这个仓库里对"会返回真实数据行"的函数（相对于
-- is_admin()/is_account_restricted() 这类只返回布尔值的谓词函数）一贯
-- 的处理方式，参见 approve_post/reject_post/delete_post/
-- set_account_status 这几个函数各自的 revoke+grant。
revoke execute on function public.get_post_snapshot(uuid) from public;
grant execute on function public.get_post_snapshot(uuid) to authenticated;

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
      and status = (select s.status from public.get_post_snapshot(posts.id) s)
      and deleted_at is not distinct from (
        select s.deleted_at from public.get_post_snapshot(posts.id) s
      )
    )
    or (
      author_id = (select s.author_id from public.get_post_snapshot(posts.id) s)
      and (
        status = (select s.status from public.get_post_snapshot(posts.id) s)
        or status <> 'approved'
      )
      and view_count = (select s.view_count from public.get_post_snapshot(posts.id) s)
      and favorite_count = (select s.favorite_count from public.get_post_snapshot(posts.id) s)
      and (
        rejection_reason is null
        or rejection_reason is not distinct from (
          select s.rejection_reason from public.get_post_snapshot(posts.id) s
        )
      )
    )
  );

-- 回滚方案（默认不执行，会重新引入本次修复的 bug，需要人工确认后单独
-- 运行，回滚成这份迁移之前——即
-- 20260722000000_add_posts_rejection_reason.sql——里的定义）：
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
--       and (
--         rejection_reason is null
--         or rejection_reason is not distinct from (
--           select p.rejection_reason from public.posts p where p.id = posts.id
--         )
--       )
--     )
--   );
--
-- revoke execute on function public.get_post_snapshot(uuid) from public;
-- drop function if exists public.get_post_snapshot(uuid);
