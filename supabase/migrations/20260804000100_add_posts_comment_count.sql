-- Migration: add posts.comment_count + sync trigger
--
-- 为什么改：
--   给 posts 表加一个冗余统计字段 comment_count，用于帖子卡片/详情页展示
--   评论数量，不用每次都现场 count(*) comments。照抄 favorite_count 的
--   实现模式（create_favorites_table 迁移）：字段 + 触发器同步 + 在
--   posts_update_own_or_admin 策略里锁死普通用户不能直接改这个字段。
--
-- 影响哪些表：
--   posts 加一列 comment_count；同时更新 posts_update_own_or_admin 这条
--   已有策略（drop + create），把新字段纳入普通用户不能直接改的锁定范围，
--   跟 view_count / favorite_count 待遇一致。
--   新增触发器函数 sync_post_comment_count，挂在 comments 表的
--   insert/update 上（comments 表已由上一份迁移建好）。
--
-- 是否影响现有数据：
--   comment_count 新增列默认值 0，现有 posts 行不需要回填——comments 表
--   刚建好，还没有任何一行评论，0 就是正确的初始值。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 关于 posts_update_own_or_admin 策略的更新方式：
--   这条策略最初在 create_posts_table 迁移里创建，后来被
--   fix_posts_update_own_or_admin_deleted_at_rls_bug 等后续迁移改成了现在
--   这个用 get_post_snapshot(posts.id) 一次性取快照、避免重复关联子查询
--   的写法（用 `select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'posts'` 直接读的线上当前定义，不是照抄最初建表
--   迁移文件里的旧版本，那份是过时的）。get_post_snapshot() 是
--   `select * from public.posts where id = target_id and (author_id =
--   auth.uid() or is_admin())`，返回整行，加了 comment_count 列之后它
--   自动就能取到这一列，函数本身不用改。

alter table public.posts
  add column comment_count bigint not null default 0;

alter table public.posts
  add constraint posts_comment_count_check check (comment_count >= 0);

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
      and not (deleted_at is distinct from (select s.deleted_at from public.get_post_snapshot(posts.id) s))
    )
    or (
      author_id = (select s.author_id from public.get_post_snapshot(posts.id) s)
      and (
        status = (select s.status from public.get_post_snapshot(posts.id) s)
        or status <> 'approved'
      )
      and view_count = (select s.view_count from public.get_post_snapshot(posts.id) s)
      and favorite_count = (select s.favorite_count from public.get_post_snapshot(posts.id) s)
      and comment_count = (select s.comment_count from public.get_post_snapshot(posts.id) s)
      and (
        rejection_reason is null
        or not (rejection_reason is distinct from (select s.rejection_reason from public.get_post_snapshot(posts.id) s))
      )
    )
  );

-- 触发器同步逻辑：
--   INSERT 一条评论 -> 对应帖子 comment_count + 1。
--   评论被软删除（deleted_at 从 null 变成非 null）-> comment_count - 1，
--     用 greatest(..., 0) 兜底避免理论上的负数。
--   评论表目前没有硬删除、也没有"编辑内容"以外的其它 UPDATE 场景（RLS 只
--   放行"软删除"这一种 UPDATE，见 create_comments_table 迁移的
--   comments_delete_own 策略），所以 UPDATE 分支只需要判断 deleted_at 的
--   这一种转变，不需要处理更复杂的场景。
--   跟 sync_post_favorite_count 一样用 security definer——触发器函数属主
--   天然拥有 posts 表，不受 posts_update_own_or_admin 这条策略"普通用户
--   不能直接改 comment_count"的限制，只有这个触发器能改这个字段，普通
--   用户自己发起的 UPDATE 请求仍然会被上面那条策略挡住。
create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set comment_count = comment_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts
      set comment_count = greatest(comment_count - 1, 0)
      where id = new.post_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create trigger comments_after_insert_sync_comment_count
  after insert on public.comments
  for each row
  execute function public.sync_post_comment_count();

create trigger comments_after_update_sync_comment_count
  after update on public.comments
  for each row
  execute function public.sync_post_comment_count();

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop trigger if exists comments_after_update_sync_comment_count on public.comments;
-- drop trigger if exists comments_after_insert_sync_comment_count on public.comments;
-- drop function if exists public.sync_post_comment_count();
-- drop policy if exists posts_update_own_or_admin on public.posts;
-- （回滚后需要手动恢复旧版 posts_update_own_or_admin 策略定义，不在此自动处理）
-- alter table public.posts drop constraint if exists posts_comment_count_check;
-- alter table public.posts drop column if exists comment_count;
