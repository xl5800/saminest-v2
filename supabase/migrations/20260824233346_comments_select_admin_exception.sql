-- Migration: comments 表 SELECT 策略加 is_admin() 例外
--
-- 为什么改：
--   UGC 安全功能补齐任务卡 3——管理员在举报处理后台需要能看到被举报评论的
--   原文（见 docs/04_Development/Apple-UGC-Compliance-Review.md 第六节）。
--   comments_select_of_approved_or_own_posts 这条 SELECT 策略（见
--   20260804000000_create_comments_table.sql）只放行"评论所属帖子已审核
--   公开"或"帖子作者本人"两种情况，没有 is_admin() 例外——如果被举报评论
--   所属的帖子当时状态不是"已审核公开"（比如帖子已经被下架、或者还在待
--   审核），管理员用现在的权限查不到这条评论，就算前端加了展示 UI 也没用，
--   问题出在这一层。
--
--   这跟本仓库已经在 post_images 表上踩过、并修过的坑是同一类问题（见
--   20260722000300_fix_post_images_update_recursion_and_select_bug.sql
--   给 post_images_select_of_approved_or_own_or_admin 加 `or
--   public.is_admin()` 那次），这次照抄同一个修法，加到 comments 表上。
--
-- 影响哪些表：
--   只重建 public.comments 的 comments_select_of_approved_or_own_posts 这
--   一条 SELECT 策略，加一个 `or public.is_admin()` 分支。不碰
--   comments_insert_own / comments_delete_own 这两条（这次任务明确不改
--   评论的发表/软删除逻辑，只开管理员的只读权限）。
--
-- 是否会引入 RLS 自引用递归：
--   不会——is_admin() 只读 profiles 表判断当前用户的 role，comments 表的
--   这条 SELECT 策略原本就已经在查 posts 表（判断帖子状态），加一个查
--   profiles 的条件不会让这条策略反过来查询 comments 自己，不构成
--   42P17 那种"策略查询自己所在的表"的递归模式，跟 post_images 那次的
--   修法是同一个安全边界。
--
-- 是否影响现有数据：
--   不影响，只放宽管理员的只读范围，不改任何现有行、不影响普通用户/匿名
--   访客原本能查到的范围。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

drop policy if exists comments_select_of_approved_or_own_posts on public.comments;

create policy comments_select_of_approved_or_own_posts
  on public.comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'approved'
        and p.visibility = 'public'
        and p.deleted_at is null
    )
    or exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
    or public.is_admin()
  );

-- 回滚方案（默认不执行，会重新引入"管理员查不到已下架/待审核帖子下的
-- 被举报评论"这个问题，需要人工确认后单独运行，回滚成
-- 20260804000000_create_comments_table.sql 里的原始定义）：
--
-- drop policy if exists comments_select_of_approved_or_own_posts on public.comments;
-- create policy comments_select_of_approved_or_own_posts
--   on public.comments
--   for select
--   to anon, authenticated
--   using (
--     exists (
--       select 1
--       from public.posts p
--       where p.id = comments.post_id
--         and p.status = 'approved'
--         and p.visibility = 'public'
--         and p.deleted_at is null
--     )
--     or exists (
--       select 1
--       from public.posts p
--       where p.id = comments.post_id
--         and p.author_id = auth.uid()
--         and p.deleted_at is null
--     )
--   );
