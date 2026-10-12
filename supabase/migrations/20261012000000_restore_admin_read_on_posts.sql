-- Migration: 恢复"管理员可以读取所有帖子"——修复待审核页看不到其他用户待审核帖子
--
-- 为什么改：
--   仓库里 posts 表的 SELECT 策略是 posts_select_public_or_own_or_admin
--   （见 20260722000200_fix_posts_select_own_deleted_at_rls_bug.sql）：
--     已通过的公开帖子 / 自己的帖子 / 管理员（is_admin()）都能读。
--   但线上实际生效的是一条名为 posts_select_public_or_own 的策略，少了
--   `or public.is_admin()` 这个分支，任何一份迁移里都找不到这条策略的
--   创建语句——是某次直接在线上改出来的漂移（out-of-band change）。
--
--   后果：/admin/pending（待审核帖子页）的 listPendingPosts() 是直接
--   `.from("posts").eq("status", "pending")` 查表，受这条策略限制，管理员
--   只能看到自己发的待审核帖子，其他用户发的待审核帖子永远不会出现在
--   审核列表里，无法通过/驳回。/admin/posts（全部帖子页）走的是
--   admin_list_posts() 这个 security definer 函数，不受影响，所以之前
--   没有被发现。待审核帖子详情页（getPostDetail，同样直接查表）也一样
--   打不开别人的待审核帖子。
--
--   恢复管理员分支不会让管理员在前台信息流里看到待审核内容：首页/分类页/
--   搜索/发帖人主页（listApprovedPosts）都在应用层显式过滤
--   status = 'approved' 和 deleted_at is null，我的发布（listMyPosts）按
--   author_id 过滤，不依赖这条策略隐藏非公开帖子。
--
-- 影响哪些表：
--   只重建 public.posts 的 SELECT 策略：删掉线上漂移出来的
--   posts_select_public_or_own，重建仓库里的
--   posts_select_public_or_own_or_admin（定义跟 20260722000200 逐字一致）。
--   两个名字都用 drop policy if exists，本地 db reset（只有 _or_admin
--   那一条）和线上（只有漂移的那一条）都能正确执行，结果一致。
--
-- 是否影响现有数据：
--   不影响，只改策略定义。
--
-- 是否需要回滚方案：
--   需要，见文件末尾注释（默认不执行，回滚会重新让待审核页看不到其他
--   用户的帖子）。

drop policy if exists posts_select_public_or_own on public.posts;
drop policy if exists posts_select_public_or_own_or_admin on public.posts;

create policy posts_select_public_or_own_or_admin
  on public.posts
  for select
  to anon, authenticated
  using (
    (status = 'approved' and visibility = 'public' and deleted_at is null)
    or (author_id = auth.uid())
    or public.is_admin()
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists posts_select_public_or_own_or_admin on public.posts;
-- create policy posts_select_public_or_own
--   on public.posts
--   for select
--   using (
--     (status = 'approved' and visibility = 'public' and deleted_at is null)
--     or (author_id = auth.uid())
--   );
