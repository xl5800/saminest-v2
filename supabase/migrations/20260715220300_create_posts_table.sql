-- Migration: create posts table
--
-- 为什么改：
--   建立 public.posts 表，保存租房/求租/二手帖子的公共数据，对应
--   docs/03_Database/Tables.md 第 9 节。
--
-- 影响哪些表：
--   新建 public.posts，外键指向 public.profiles / public.categories /
--   public.locations（三张表均已由前序迁移建好）。
--
-- 是否影响现有数据：
--   不影响，全新表；本次任务范围只到 posts，没有要求写入种子数据，
--   本迁移不插入任何 posts 测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  category_id uuid not null references public.categories (id),
  location_id uuid null default null references public.locations (id),
  title text not null,
  description text not null,
  price_amount numeric(12, 2) null default null,
  currency_code text not null default 'USD',
  price_label text null default null,
  contact_method text null default null,
  contact_value text null default null,
  status text not null default 'pending',
  visibility text not null default 'public',
  view_count bigint not null default 0,
  favorite_count bigint not null default 0,
  published_at timestamptz null default null,
  expires_at timestamptz null default null,
  archived_at timestamptz null default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  -- 9.3 / 9.4 / 9.5 节：状态类字段取值用数据库约束固定（第 3.6 节建议）
  constraint posts_status_check
    check (status in ('draft', 'pending', 'approved', 'rejected', 'archived', 'deleted')),
  constraint posts_visibility_check
    check (visibility in ('public', 'unlisted', 'private')),
  constraint posts_contact_method_check
    check (contact_method is null or contact_method in ('message', 'email', 'phone', 'wechat', 'other')),

  -- 9.6 / 25 节：字段验证约束
  constraint posts_title_length_check
    check (char_length(title) between 5 and 120),
  constraint posts_description_length_check
    check (char_length(description) between 10 and 10000),
  constraint posts_price_amount_check
    check (price_amount is null or price_amount >= 0),
  constraint posts_currency_code_length_check
    check (char_length(currency_code) = 3),
  constraint posts_view_count_check check (view_count >= 0),
  constraint posts_favorite_count_check check (favorite_count >= 0)
);

comment on table public.posts is
  '租房/求租/二手帖子，参见 docs/03_Database/Tables.md 第 9 节。';

-- 9.7 节索引
create index posts_author_id_idx on public.posts (author_id);
create index posts_category_id_idx on public.posts (category_id);
create index posts_location_id_idx on public.posts (location_id);
create index posts_status_idx on public.posts (status);
create index posts_created_at_desc_idx on public.posts (created_at desc);
create index posts_published_at_desc_idx on public.posts (published_at desc);
create index posts_category_status_published_idx
  on public.posts (category_id, status, published_at desc);
create index posts_location_status_published_idx
  on public.posts (location_id, status, published_at desc);
create index posts_author_status_created_idx
  on public.posts (author_id, status, created_at desc);

create trigger posts_set_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();

-- 第 22 节：启用 RLS
alter table public.posts enable row level security;

-- 9.8 权限原则：
--
--   游客（anon）：
--     - 只能读取 approved 且 public 且未软删除的帖子。
--
--   登录用户（authenticated）：
--     - 可以创建自己的帖子（author_id 必须是自己，且新建状态只能是
--       draft 或 pending，不能直接以 approved 状态插入）。
--     - 可以读取自己未软删除的帖子（含草稿/待审核/被拒绝），
--       加上所有 approved+public 的帖子。
--     - 只能修改自己的帖子。
--     - 不能把状态直接改为 approved——但允许"帖子本来就是 approved、
--       只编辑其他字段、状态本身不变"这种更新，只拦截"从非 approved
--       变成 approved"这个动作本身。
--     - 不能修改 view_count。
--     - 不能修改 favorite_count。
--
--   管理员（role 为 admin/super_admin，见 public.is_admin()）：
--     - 可以读取全部帖子（含未审核、已软删除，便于审核和恢复）。
--     - 可以修改帖子审核状态和其他字段，不受上面对普通用户的限制约束。

create policy posts_select_public_or_own_or_admin
  on public.posts
  for select
  to anon, authenticated
  using (
    (status = 'approved' and visibility = 'public' and deleted_at is null)
    or (author_id = auth.uid() and deleted_at is null)
    or public.is_admin()
  );

create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin() or status in ('draft', 'pending'))
  );

create policy posts_update_own_or_admin
  on public.posts
  for update
  to authenticated
  using (
    (author_id = auth.uid() and deleted_at is null)
    or public.is_admin()
  )
  with check (
    public.is_admin()
    or (
      author_id = (select p.author_id from public.posts p where p.id = posts.id)
      and (
        status = (select p.status from public.posts p where p.id = posts.id)
        or status <> 'approved'
      )
      and view_count = (select p.view_count from public.posts p where p.id = posts.id)
      and favorite_count = (select p.favorite_count from public.posts p where p.id = posts.id)
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists posts_update_own_or_admin on public.posts;
-- drop policy if exists posts_insert_own on public.posts;
-- drop policy if exists posts_select_public_or_own_or_admin on public.posts;
-- drop trigger if exists posts_set_updated_at on public.posts;
-- drop table if exists public.posts;
