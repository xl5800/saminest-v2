-- Migration: favorites 表支持收藏活动（不只是帖子）
--
-- 为什么改：
--   活动详情页重设计要加"收藏"按钮（跟帖子详情页的收藏是同一个产品概念，
--   用户确认"收藏活动"这次一起做）。现有 favorites 表的 post_id 是
--   not null，只能收藏帖子，没有对应活动的外键列。
--
-- 影响哪些表：
--   public.favorites：post_id 放开可空，新增 activity_id（可空，外键指向
--   activities），加一条 check 约束保证"post_id 和 activity_id 正好有
--   一个不为空"，新增 (user_id, activity_id) 唯一约束（跟已有的
--   (user_id, post_id) 唯一约束是同一个防重复收藏的道理，两条约束互不
--   干扰——Postgres 的 unique 约束里 NULL 不等于 NULL，帖子收藏行的
--   activity_id 全是 null，不会被这条新约束误判成重复）。同时重新定义
--   sync_post_favorite_count() 触发器函数，加一个 post_id is not null
--   的判断，避免活动收藏行触发一次"where id = null"的空操作 UPDATE。
--
--   activities 表这次不加 favorite_count 列——现在帖子详情页/列表页都
--   已经不展示 favorite_count 这个数字了（Facebook Marketplace 风格改版
--   之后收藏数从来不公开展示，只有收藏按钮本身的选中态），活动这次的
--   设计稿（用户确认过）同样没有展示收藏数，只需要"当前用户有没有收藏
--   这个活动"这个布尔值，不需要为一个不展示的数字维护一个同步触发器。
--
-- 是否影响现有数据：
--   不影响现有行——post_id 放开可空不会让已有的非空值变成空；新约束对
--   历史数据天然满足（历史行 post_id 都不为空、activity_id 都是 null）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.favorites
  alter column post_id drop not null;

alter table public.favorites
  add column activity_id uuid null references public.activities (id);

alter table public.favorites
  add constraint favorites_target_check
    check (
      (post_id is not null and activity_id is null)
      or
      (post_id is null and activity_id is not null)
    );

alter table public.favorites
  add constraint favorites_user_id_activity_id_key unique (user_id, activity_id);

create index favorites_activity_id_idx on public.favorites (activity_id);

comment on column public.favorites.activity_id is
  '收藏的活动 id，跟 post_id 正好有一个不为空（见 favorites_target_check）。收藏活动这次不维护 activities.favorite_count 冗余计数——活动详情页设计稿没有展示这个数字，只需要布尔态。';

create or replace function public.sync_post_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.post_id is not null then
      update public.posts
      set favorite_count = favorite_count + 1
      where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.post_id is not null then
      update public.posts
      set favorite_count = greatest(favorite_count - 1, 0)
      where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- create or replace function public.sync_post_favorite_count()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if tg_op = 'INSERT' then
--     update public.posts
--     set favorite_count = favorite_count + 1
--     where id = new.post_id;
--     return new;
--   elsif tg_op = 'DELETE' then
--     update public.posts
--     set favorite_count = greatest(favorite_count - 1, 0)
--     where id = old.post_id;
--     return old;
--   end if;
--   return null;
-- end;
-- $$;
--
-- drop index if exists favorites_activity_id_idx;
-- alter table public.favorites drop constraint favorites_user_id_activity_id_key;
-- alter table public.favorites drop constraint favorites_target_check;
-- alter table public.favorites drop column activity_id;
-- alter table public.favorites alter column post_id set not null;
