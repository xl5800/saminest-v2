-- Migration: fix comments RLS 无限递归 bug
--
-- 为什么改：
--   用户反馈"发表评论失败"。排查发现 comments_insert_own（WITH CHECK 里
--   校验 parent_id 是否属于同一个 post_id）和 comments_delete_own
--   （WITH CHECK 里锁死软删除时其余字段不能变）这两条策略，都直接用
--   `select ... from public.comments c where c.id = ...` 这种correlated
--   子查询在 comments 表自己的策略里查询 comments 表本身——直接触发
--   Postgres 报错 `42P17: infinite recursion detected in policy for
--   relation "comments"`。用一条顶层评论（parent_id is null）实测复现：
--   即使 parent_id 是 null、理论上不会走到那个 exists() 分支，Postgres
--   规划这条 INSERT 语句时仍然会因为策略里存在这个自引用子查询而报错，
--   不是"只有真的传了 parent_id 才会触发"。
--
--   这个仓库已经在 posts 表上踩过同一类坑，并且已经修过一次：
--   posts_update_own_or_admin 策略最早也是直接用
--   `select p.status from public.posts p where p.id = posts.id` 这种自
--   引用子查询，后来改成用一个 SECURITY DEFINER 的快照函数
--   get_post_snapshot() 包一层——SECURITY DEFINER 函数内部的查询以函数
--   属主的身份执行，不再触发调用方所在的那条 RLS 策略被重新求值，从而
--   打破递归。这次犯的是同一个错误（写 comments 表的策略时忘了套用这个
--   已经验证过的修法，直接手写了自引用子查询），现在用同一个模式修：
--   新增 get_comment_snapshot()，comments_insert_own /
--   comments_delete_own 都改成通过它取"这条评论当前的值"，不再直接查
--   public.comments。
--
-- 影响哪些表：
--   新增函数 public.get_comment_snapshot()；重建
--   comments_insert_own / comments_delete_own 这两条已有策略（drop +
--   create，SQL 逻辑本身不变，只是把自引用子查询换成走 SECURITY
--   DEFINER 函数），comments_select_of_approved_or_own_posts 不受影响
--   （它只查询 posts，没有自引用，实测过 SELECT 不会触发这个错误）。
--
-- 是否影响现有数据：
--   不影响，comments 表现在还是空的（这个 bug 导致所有发表评论的尝试
--   之前全部失败，没有任何一行真的写进去过）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--   但不建议回滚——回滚会恢复这个已确认的 bug。
--
-- 验证方式：
--   在事务里用 SET LOCAL ROLE authenticated + SET LOCAL request.jwt.claims
--   模拟真实登录用户，依次测试了：顶层评论 insert、对刚发的评论再 insert
--   一条回复（parent_id 指向刚才那条）、对刚发的顶层评论做软删除
--   update——三种操作在应用这份迁移前均报 42P17，应用后全部成功，最后
--   rollback 不留任何测试数据。

create or replace function public.get_comment_snapshot(target_id uuid)
returns comments
language sql
stable
security definer
set search_path = public
as $$
  select * from public.comments where id = target_id;
$$;

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_account_restricted()
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.deleted_at is null
        and (
          (p.status = 'approved' and p.visibility = 'public')
          or p.author_id = auth.uid()
        )
    )
    and (
      parent_id is null
      or (select s.post_id from public.get_comment_snapshot(parent_id) s) = comments.post_id
    )
  );

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
  on public.comments
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and deleted_at is null
  )
  with check (
    user_id = (select s.user_id from public.get_comment_snapshot(comments.id) s)
    and post_id = (select s.post_id from public.get_comment_snapshot(comments.id) s)
    and parent_id is not distinct from (select s.parent_id from public.get_comment_snapshot(comments.id) s)
    and content = (select s.content from public.get_comment_snapshot(comments.id) s)
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行——不建议回滚，会恢复 bug）：
--
-- drop policy if exists comments_delete_own on public.comments;
-- drop policy if exists comments_insert_own on public.comments;
-- drop function if exists public.get_comment_snapshot(uuid);
-- （回滚后需要手动恢复旧版两条策略的定义，不在此自动处理）
