-- Migration: fix deleteMyPost 100% 必现 42501 的真正根因——SELECT 策略
-- 作者分支的 deleted_at IS NULL，不是 posts_update_own_or_admin
--
-- 为什么改：
--   20260722000100_fix_posts_update_own_or_admin_deleted_at_rls_bug.sql
--   已经上线，但 deleteMyPost() 依然 100% 必现 42501。用真实模拟身份、
--   在事务内对照实验重新定位（跑完立刻 rollback，没有污染数据）：
--
--   1. 把 posts_update_own_or_admin 的 with check 临时硬编码成
--      `true`（连 get_post_snapshot 都不调用），UPDATE 依然报同样的
--      42501——直接证明问题从一开始就不在这条 UPDATE 策略上，
--      20260722000100 那次修复诊断的是一个真实存在、但不是这次真正
--      卡住流程的问题。
--   2. 同时把 posts_select_public_or_own_or_admin 的 using 也临时
--      放开成 `true`，UPDATE 立刻成功。唯一变量是 SELECT 策略，
--      结果直接翻转，锁定根因在这条策略上。
--
--   根因：Postgres 对 UPDATE 的行级安全执行，除了目标 UPDATE 策略自己的
--   with check，新行还必须能通过这张表的 SELECT 策略——这一步不受
--   UPDATE 策略内容影响，哪怕 UPDATE 的 with check 写成 `true` 也一样。
--   posts_select_public_or_own_or_admin 的作者分支是
--   `author_id = auth.uid() and deleted_at is null`：deleteMyPost()
--   把 deleted_at 从 null 改成 now() 的那一刻，新行在这条策略的作者
--   分支下已经不满足 deleted_at is null，公开分支（要求 approved+public）
--   和管理员分支也都不适用，新行对作者本人变得不可见，Postgres 因此
--   判定这次修改违反行级安全策略，报 42501——跟"这一行到底属不属于
--   当前用户"无关，是"改完之后新行还看不看得见自己"这个独立维度的
--   问题。updatePost()/archivePost()/resubmitPost() 都不碰 deleted_at，
--   新行改完后作者分支依然成立，所以三个方法一直正常，只有
--   deleteMyPost() 会撞上这个问题。
--
-- 影响哪些表：
--   不新建表，只重建 public.posts 上的
--   posts_select_public_or_own_or_admin 这一条 SELECT 策略。
--
-- 修法：
--   去掉作者分支里的 deleted_at is null 限制，允许作者始终能通过 RLS
--   查到自己的帖子（含已软删除的）。公开分支（陌生人能看到的
--   approved+public 帖子）保留 deleted_at is null，陌生人依旧看不到
--   已删除的帖子，不受这次改动影响。
--
--   这条限制对作者分支而言本来就是冗余的：listMyPosts（我的发布列表）
--   已经在应用层显式 `.is("deleted_at", null)` 过滤掉已删除帖子，
--   getPostDetail（帖子详情页）也一样显式过滤，不依赖 RLS 来隐藏
--   已删除帖子——去掉这条限制不会让作者在任何现有界面上看到自己
--   已删除的帖子，唯一实际效果就是把 deleteMyPost() 这次 UPDATE 卡死。
--
--   已知的行为变化（评估过，不影响任何现有界面）：
--   posts-repository.ts 的 getPostAuthorId()（ContactSellerButton 用，
--   判断当前用户是不是发布者）没有显式过滤 deleted_at，这次改动后，
--   如果直接拿一个已软删除帖子的 ID 调用这个函数、且当前登录用户正好
--   是这个帖子的作者，会从"返回 null"变成"返回真实 author_id"。
--   实际不会触发：帖子详情页（唯一会用到 ContactSellerButton 的地方）
--   走 getPostDetail()，已经在应用层过滤了 deleted_at，已删除帖子的
--   详情页本身就返回 null、渲染"帖子未找到"，不会走到调用
--   getPostAuthorId() 这一步。
--
-- 是否影响现有数据：
--   不影响，只改策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，会重新引入本次修复的
--   bug，需要人工确认后单独运行）。

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

-- 回滚方案（默认不执行，会重新引入 deleteMyPost 必现 42501 的 bug，
-- 需要人工确认后单独运行，回滚成
-- 20260715220300_create_posts_table.sql 里的原始定义）：
--
-- drop policy if exists posts_select_public_or_own_or_admin on public.posts;
-- create policy posts_select_public_or_own_or_admin
--   on public.posts
--   for select
--   to anon, authenticated
--   using (
--     (status = 'approved' and visibility = 'public' and deleted_at is null)
--     or (author_id = auth.uid() and deleted_at is null)
--     or public.is_admin()
--   );
