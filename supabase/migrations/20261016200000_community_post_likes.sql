-- Migration: 社区帖子点赞
--
-- 为什么改：
--   社区帖子目前只有评论和收藏，冷启动阶段帖子少、评论更少，发帖人几乎得不到
--   反馈。点赞是成本最低的反馈方式，也让游客直观看到"这里有人在看"。产品定的
--   规则：只有社区帖子能点赞（租房/二手这些分类帖子不加）；同一个人对同一条帖子
--   只能赞一次，可以取消；图标是 Facebook 那种大拇指。
--
-- 影响哪些表：
--   1. 新建 public.community_post_likes（谁赞了哪条社区帖子），主键
--      (user_id, community_post_id) 保证不会重复点赞。
--   2. public.community_posts 新增 like_count 列（默认 0），由触发器
--      sync_community_post_like_count 在点赞/取消时自动加减——跟 favorite_count
--      / comment_count 同一个"触发器维护计数列"模式（见 20261008032102、
--      20261008033050）。
--   3. 重建 community_posts 的 UPDATE 策略 community_posts_update_own_or_admin：
--      作者分支原来锁住了 comment_count / favorite_count（作者不能自己改计数），
--      这里把 like_count 也一起锁住，否则作者可以直接 UPDATE 把自己的点赞数改成
--      9999。其它条件跟 20261008032102 里的定义逐字一致（已用线上 pg_policies
--      核对过，线上没有漂移）。
--
--   RLS（community_post_likes）：
--     - SELECT：只能读自己的点赞记录（前端只需要知道"我赞过哪些"，每条帖子的
--       总数直接读 community_posts.like_count，不需要读别人的点赞记录）；
--     - INSERT：只能以自己的身份点赞，账号被封禁（suspended）不能点赞（跟
--       favorites_insert_own 同一个口径：restricted 仍可点赞/收藏，suspended
--       不行），并且只能赞当前能看到的、审核通过且没删除的帖子——exists 子查询
--       会经过 community_posts 自己的 SELECT 策略，所属社区被关闭的帖子也赞不了；
--     - DELETE：只能取消自己的点赞；
--     - 不开放 UPDATE（点赞记录没有可改的字段）。
--
-- 是否影响现有数据：
--   不修改任何现有行。现有帖子的 like_count 都从 0 开始（之前没有点赞功能，
--   不存在需要回填的历史数据）。
--
-- 是否需要回滚方案：
--   需要，见文件末尾注释（默认不执行）。

-- ---------------------------------------------------------------------
-- 1. 点赞计数列
-- ---------------------------------------------------------------------
alter table public.community_posts
  add column like_count bigint not null default 0 check (like_count >= 0);

-- ---------------------------------------------------------------------
-- 2. 点赞记录表
-- ---------------------------------------------------------------------
create table public.community_post_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, community_post_id)
);

comment on table public.community_post_likes is
  '社区帖子点赞记录：一人一帖一条，取消点赞即删除这一行。总数见 community_posts.like_count。';

-- 按帖子查/按帖子级联删除时用；按用户查走主键的前缀。
create index community_post_likes_community_post_id_idx
  on public.community_post_likes (community_post_id);

alter table public.community_post_likes enable row level security;

create policy community_post_likes_select_own
  on public.community_post_likes
  for select
  to authenticated
  using (user_id = auth.uid());

create policy community_post_likes_insert_own
  on public.community_post_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_account_suspended()
    and exists (
      select 1
      from public.community_posts p
      where p.id = community_post_likes.community_post_id
        and p.status = 'approved'
        and p.deleted_at is null
    )
  );

create policy community_post_likes_delete_own
  on public.community_post_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.community_post_likes from anon;
revoke update on public.community_post_likes from authenticated;
grant select, insert, delete on public.community_post_likes to authenticated;

-- ---------------------------------------------------------------------
-- 3. 计数触发器
-- ---------------------------------------------------------------------
create or replace function public.sync_community_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
    set like_count = like_count + 1
    where id = new.community_post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
    set like_count = greatest(like_count - 1, 0)
    where id = old.community_post_id;
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function public.sync_community_post_like_count() from public, anon, authenticated;

create trigger community_post_likes_after_insert_sync_like_count
  after insert on public.community_post_likes
  for each row execute function public.sync_community_post_like_count();

create trigger community_post_likes_after_delete_sync_like_count
  after delete on public.community_post_likes
  for each row execute function public.sync_community_post_like_count();

-- ---------------------------------------------------------------------
-- 4. 作者不能自己改点赞数：重建 UPDATE 策略，作者分支多锁一列 like_count
-- ---------------------------------------------------------------------
drop policy if exists community_posts_update_own_or_admin on public.community_posts;

create policy community_posts_update_own_or_admin on public.community_posts
  for update
  to authenticated
  using ((author_id = auth.uid() and deleted_at is null) or public.is_admin())
  with check (
    (
      public.is_admin()
      and status = (select s.status from public.get_community_post_snapshot(community_posts.id) s)
      and deleted_at is not distinct from (select s.deleted_at from public.get_community_post_snapshot(community_posts.id) s)
    )
    or (
      author_id = (select s.author_id from public.get_community_post_snapshot(community_posts.id) s)
      and community_id = (select s.community_id from public.get_community_post_snapshot(community_posts.id) s)
      and status = (select s.status from public.get_community_post_snapshot(community_posts.id) s)
      and comment_count = (select s.comment_count from public.get_community_post_snapshot(community_posts.id) s)
      and favorite_count = (select s.favorite_count from public.get_community_post_snapshot(community_posts.id) s)
      and like_count = (select s.like_count from public.get_community_post_snapshot(community_posts.id) s)
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists community_posts_update_own_or_admin on public.community_posts;
-- create policy community_posts_update_own_or_admin on public.community_posts
--   for update
--   to authenticated
--   using ((author_id = auth.uid() and deleted_at is null) or public.is_admin())
--   with check (
--     (
--       public.is_admin()
--       and status = (select s.status from public.get_community_post_snapshot(community_posts.id) s)
--       and deleted_at is not distinct from (select s.deleted_at from public.get_community_post_snapshot(community_posts.id) s)
--     )
--     or (
--       author_id = (select s.author_id from public.get_community_post_snapshot(community_posts.id) s)
--       and community_id = (select s.community_id from public.get_community_post_snapshot(community_posts.id) s)
--       and status = (select s.status from public.get_community_post_snapshot(community_posts.id) s)
--       and comment_count = (select s.comment_count from public.get_community_post_snapshot(community_posts.id) s)
--       and favorite_count = (select s.favorite_count from public.get_community_post_snapshot(community_posts.id) s)
--     )
--   );
--
-- drop trigger if exists community_post_likes_after_delete_sync_like_count on public.community_post_likes;
-- drop trigger if exists community_post_likes_after_insert_sync_like_count on public.community_post_likes;
-- drop function if exists public.sync_community_post_like_count();
-- drop table if exists public.community_post_likes;
-- alter table public.community_posts drop column if exists like_count;
