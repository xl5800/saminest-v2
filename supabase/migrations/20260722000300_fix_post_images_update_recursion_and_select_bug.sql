-- Migration: fix post_images 的两个 RLS bug——UPDATE 策略自引用子查询
-- 导致的无限递归，以及 SELECT 策略连带的"作者软删除自己图片后新行
-- 对自己不可见"问题
--
-- 为什么改：
--   实现"编辑帖子"功能时，需要支持作者删除已上传的图片（软删除：设置
--   post_images.deleted_at），照搬 posts 表"作者自助软删除走
--   posts_update_own_or_admin 直接 UPDATE"的模式，用真实模拟身份对
--   post_images 做同样的 UPDATE 测试，发现两个独立问题：
--
--   1. post_images_update_own_post 的 with check 里有一段自引用子查询：
--        post_id = (select pi.post_id from public.post_images pi where pi.id = post_images.id)
--      用来锁定"这次 UPDATE 不能顺带把 post_id 改掉"。这个写法和
--      20260722000100 修复之前 posts_update_own_or_admin 用的
--      `select p.xxx from public.posts p where p.id = posts.id` 是同一种
--      "直接自引用 SELECT（受本表 SELECT 策略约束）"模式，但 post_images
--      这边实测报的不是值不匹配，而是直接 42P17
--      "infinite recursion detected in policy for relation post_images"——
--      比 posts 那次的表现更严重，直接拒绝执行。
--
--   2. 就算先只看 SELECT 策略本身：post_images_select_of_approved_or_own_or_admin
--      的 using 顶层有一个 `deleted_at is null`，对"作者能看自己帖子的图片"
--      这个分支同样生效——跟 20260722000200 修的
--      posts_select_public_or_own_or_admin 是同一个坑：作者把一张图片的
--      deleted_at 从 null 改成 now() 的那一刻，新行在 SELECT 策略里对
--      作者本人也变得不可见，Postgres 判定这次修改违反行级安全策略。
--      用干净的临时测试数据（建一条帖子 + 一张图片，事务内测试完立刻
--      rollback）验证过：只修第 1 点、不修第 2 点，UPDATE 会从
--      "报递归错误"变成"报 42501"，两个问题必须一起改。
--
-- 影响哪些表：
--   不新建表。新增一个 security definer 辅助函数
--   public.get_post_image_snapshot()（跟 posts 表的 get_post_snapshot()
--   是同一个模式：绕开自引用 SELECT 受本表 RLS 约束的问题，只做一次按
--   主键的普通查询），重建 post_images 表上的
--   post_images_update_own_post（UPDATE）和
--   post_images_select_of_approved_or_own_or_admin（SELECT）这两条策略。
--
-- 修法：
--   1. get_post_image_snapshot(target_id)：跟 get_post_snapshot 一样，
--      显式加 `and (owner_id = auth.uid() or public.is_admin())` 过滤
--      调用者范围（不能因为绕开了 RLS 就变成任何人都能拿这个函数查任意
--      图片的元数据），revoke from public + grant to authenticated。
--
--      post_images_update_own_post 的 with check 里，`post_id = (自引用
--      子查询)` 换成 `post_id = (select s.post_id from
--      get_post_image_snapshot(post_images.id) s)`，消除递归。
--
--   2. post_images_select_of_approved_or_own_or_admin：把顶层的
--      `deleted_at is null` 从"对所有分支都生效"改成"只对公开
--      （approved+public）分支生效"，作者分支和管理员分支不再要求图片
--      自己的 deleted_at is null——跟 20260722000200 修 posts 表 SELECT
--      策略同一个理由：应用层每处展示图片的地方（resolveCoverImageUrl /
--      getPostDetail 里过滤 post_images 的 deleted_at）已经显式过滤过
--      已删除图片，不依赖这条 RLS 来隐藏，这条限制对作者分支只有反作用。
--      公开分支保留 deleted_at is null，陌生人依旧看不到已删除的图片。
--
-- 是否影响现有数据：
--   不影响，只改函数/策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create or replace function public.get_post_image_snapshot(target_id uuid)
returns public.post_images
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.post_images
  where id = target_id
    and (owner_id = auth.uid() or public.is_admin());
$$;

revoke execute on function public.get_post_image_snapshot(uuid) from public;
grant execute on function public.get_post_image_snapshot(uuid) to authenticated;

drop policy if exists post_images_update_own_post on public.post_images;

create policy post_images_update_own_post
  on public.post_images
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.author_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and post_id = (select s.post_id from public.get_post_image_snapshot(post_images.id) s)
    and exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists post_images_select_of_approved_or_own_or_admin on public.post_images;

create policy post_images_select_of_approved_or_own_or_admin
  on public.post_images
  for select
  to anon, authenticated
  using (
    (
      deleted_at is null
      and exists (
        select 1 from public.posts p
        where p.id = post_images.post_id
          and p.status = 'approved'
          and p.visibility = 'public'
          and p.deleted_at is null
      )
    )
    or exists (
      select 1 from public.posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
    or public.is_admin()
  );

-- 回滚方案（默认不执行，会重新引入本次修复的两个 bug，需要人工确认后
-- 单独运行，回滚成 20260716000000_create_post_images_table.sql /
-- 20260717000200_admin_moderation_backend.sql 里的定义）：
--
-- drop policy if exists post_images_select_of_approved_or_own_or_admin on public.post_images;
-- create policy post_images_select_of_approved_or_own_or_admin
--   on public.post_images
--   for select
--   to anon, authenticated
--   using (
--     deleted_at is null
--     and (
--       exists (
--         select 1 from public.posts p
--         where p.id = post_images.post_id
--           and p.status = 'approved'
--           and p.visibility = 'public'
--           and p.deleted_at is null
--       )
--       or exists (
--         select 1 from public.posts p
--         where p.id = post_images.post_id
--           and p.author_id = auth.uid()
--           and p.deleted_at is null
--       )
--       or public.is_admin()
--     )
--   );
--
-- drop policy if exists post_images_update_own_post on public.post_images;
-- create policy post_images_update_own_post
--   on public.post_images
--   for update
--   to authenticated
--   using (
--     owner_id = auth.uid()
--     and exists (
--       select 1 from public.posts p
--       where p.id = post_images.post_id and p.author_id = auth.uid()
--     )
--   )
--   with check (
--     owner_id = auth.uid()
--     and post_id = (select pi.post_id from public.post_images pi where pi.id = post_images.id)
--     and exists (
--       select 1 from public.posts p
--       where p.id = post_images.post_id and p.author_id = auth.uid()
--     )
--   );
--
-- revoke execute on function public.get_post_image_snapshot(uuid) from public;
-- drop function if exists public.get_post_image_snapshot(uuid);
