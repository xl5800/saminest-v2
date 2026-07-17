-- Migration: create favorites table
--
-- 为什么改：
--   建立 public.favorites 表，记录用户收藏帖子的关系，对应
--   docs/01_Product/PRD.md 第十一章（收藏/取消收藏/查看收藏）和
--   docs/03_Database/Tables.md 第 11 节。
--
-- 影响哪些表：
--   新建 public.favorites，外键指向 public.profiles / public.posts
--   （均已由前序迁移建好）。
--   同时会给 public.posts 加一个 AFTER INSERT/DELETE 触发器，用来在
--   favorites 增删时自动同步 posts.favorite_count（11.6 节），
--   不修改 posts 表结构本身（favorite_count 字段已经在 posts 表迁移里存在）。
--
-- 是否影响现有数据：
--   favorites 是全新表，不影响现有数据。
--   触发器只在未来发生 favorites 行的插入/删除时才会执行，
--   不会补算现有 posts 行的 favorite_count（现在还没有任何收藏记录，
--   现有 posts.favorite_count 本来就是新表默认值 0，不需要回填）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 特别说明（19 节 / 21 节）：
--   favorites 属于"只是用户关系记录"的表，文档明确说可以物理删除、
--   不需要软删除，所以这张表没有 deleted_at 字段，DELETE 策略也是
--   真删除，不是软删除。

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  post_id uuid not null references public.posts (id),
  created_at timestamptz not null default now(),

  -- 11.3 节：防止同一用户重复收藏同一帖子
  constraint favorites_user_id_post_id_key unique (user_id, post_id)
);

comment on table public.favorites is
  '用户收藏帖子的关系记录，参见 docs/03_Database/Tables.md 第 11 节。';

-- 11.4 节索引
create index favorites_user_id_created_at_desc_idx
  on public.favorites (user_id, created_at desc);
create index favorites_post_id_idx on public.favorites (post_id);

-- 第 22 节：启用 RLS
alter table public.favorites enable row level security;

-- 11.5 权限原则：
--   - 用户只能查看自己的收藏。
--   - 用户只能创建自己的收藏，不能为其他用户创建收藏记录。
--   - 用户只能删除自己的收藏。
--   （文档没有提到收藏行需要被"修改"的场景，所以没有 UPDATE 策略，
--   也没有给 anon 开放任何权限——收藏是登录用户的私有数据。）

create policy favorites_select_own
  on public.favorites
  for select
  to authenticated
  using (user_id = auth.uid());

create policy favorites_insert_own
  on public.favorites
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy favorites_delete_own
  on public.favorites
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 11.6 节："posts.favorite_count 可以作为冗余统计字段"，且不能被客户端
-- 直接修改（posts 表自己的 posts_update_own_or_admin 策略已经要求普通用户
-- 的 UPDATE 必须保持 favorite_count 不变，见 create_posts_table 迁移）。
-- 这里用触发器在 favorites 增/删时自动维护这个计数，触发器函数用
-- security definer（且函数属主是建表的角色，天然拥有 posts 表，
-- 不受 posts 自身 RLS 限制），所以能绕过 posts_update_own_or_admin
-- 那条"favorite_count 不能变"的普通用户限制，而普通用户自己发起的
-- UPDATE 请求仍然会被那条策略挡住——只有这个触发器能改这个字段。
create or replace function public.sync_post_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set favorite_count = favorite_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set favorite_count = greatest(favorite_count - 1, 0)
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger favorites_after_insert_sync_favorite_count
  after insert on public.favorites
  for each row
  execute function public.sync_post_favorite_count();

create trigger favorites_after_delete_sync_favorite_count
  after delete on public.favorites
  for each row
  execute function public.sync_post_favorite_count();

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop trigger if exists favorites_after_delete_sync_favorite_count on public.favorites;
-- drop trigger if exists favorites_after_insert_sync_favorite_count on public.favorites;
-- drop function if exists public.sync_post_favorite_count();
-- drop policy if exists favorites_delete_own on public.favorites;
-- drop policy if exists favorites_insert_own on public.favorites;
-- drop policy if exists favorites_select_own on public.favorites;
-- drop table if exists public.favorites;
