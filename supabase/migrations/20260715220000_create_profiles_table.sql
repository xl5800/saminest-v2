-- Migration: create profiles table
--
-- 为什么改：
--   建立 public.profiles 表，保存用户公开资料、角色和账号业务状态，
--   对应 docs/03_Database/Tables.md 第 6 节。Supabase Auth 只负责邮箱/
--   密码/Session，业务层的角色、账号状态、资料字段由本表承担。
--
-- 影响哪些表：
--   新建 public.profiles。
--   本迁移同时创建两个后续迁移会复用的对象，避免每张表重复实现：
--     - public.set_updated_at()：统一的 updated_at 维护触发器函数
--       （Tables.md 第 20 节）。
--     - public.is_admin()：管理员判断函数，后续 categories/locations/
--       posts 的 RLS 策略会引用它判断"当前用户是否为管理员角色"。
--
-- 是否影响现有数据：
--   不影响。这是全新表，数据库中目前没有 profiles 表。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 特别说明：
--   profiles.location_id 按文档指向 locations 表，但 locations 表要到
--   下一份迁移才创建；而 locations/categories 的管理员写入策略又需要读取
--   本表的 role 字段。为了避免"profiles 需要 locations，locations 的
--   策略又需要 profiles"这种循环依赖：
--     - 本迁移里 location_id 只声明字段类型，不加外键约束；
--     - 外键约束 profiles.location_id -> locations.id 会在
--       create_locations_table 迁移里用 alter table 补上。
--   这只是延后外键生效时间，最终字段类型、可空性、默认值仍严格按
--   Tables.md 第 6.2 节实现，没有增加或修改任何字段。

create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null,
  avatar_url text null default null,
  bio text null default null,
  location_id uuid null default null,
  role text not null default 'user',
  account_status text not null default 'active',
  is_verified boolean not null default false,
  last_active_at timestamptz null default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  -- 6.3 / 6.4 节：状态类字段的取值用数据库约束固定，避免出现
  -- 拼写不同但含义相同的值（第 3.6 节的建议）。
  constraint profiles_role_check
    check (role in ('user', 'moderator', 'admin', 'super_admin')),
  constraint profiles_account_status_check
    check (account_status in ('active', 'restricted', 'suspended', 'deleted'))
);

comment on table public.profiles is
  '用户公开资料和账号业务状态，参见 docs/03_Database/Tables.md 第 6 节。';

-- 6.5 节索引
create index profiles_location_id_idx on public.profiles (location_id);
create index profiles_role_idx on public.profiles (role);
create index profiles_account_status_idx on public.profiles (account_status);
create index profiles_created_at_idx on public.profiles (created_at);

-- 第 20 节：统一的 updated_at 维护函数，后续 categories/locations/posts
-- 迁移会直接复用这个函数，不重复创建。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- 管理员判断函数，供本表及后续 categories/locations/posts 的 RLS 策略复用。
-- 使用 security definer 是为了避免该函数在其他表的策略里被调用时，
-- 反过来受 profiles 自身 RLS 限制而查不到角色数据。
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$$;

-- 第 22 节：启用 RLS
alter table public.profiles enable row level security;

-- 6.6 权限原则：
--   - 用户可以读取正常公开资料（未软删除），本人始终可以读取自己的资料
--     （即便已被软删除，用于账号找回等场景）。
--   - 用户只能新增/修改自己的资料行。
--   - role / account_status 不允许通过这条面向 anon/authenticated 的
--     策略修改——6.6 节明确"管理员角色和账号状态只能由受信任的后台操作
--     修改"，即通过 service_role（天然绕过 RLS），而不是放宽这条策略。

create policy profiles_select_public_or_self
  on public.profiles
  for select
  to anon, authenticated
  using (
    deleted_at is null
    or id = auth.uid()
  );

create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
  );

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (
    id = auth.uid()
  )
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = profiles.id)
    and account_status = (select p.account_status from public.profiles p where p.id = profiles.id)
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists profiles_update_self on public.profiles;
-- drop policy if exists profiles_insert_self on public.profiles;
-- drop policy if exists profiles_select_public_or_self on public.profiles;
-- drop trigger if exists profiles_set_updated_at on public.profiles;
-- drop function if exists public.is_admin();
-- drop function if exists public.set_updated_at();
-- drop table if exists public.profiles;
