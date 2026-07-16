-- Migration: create categories table
--
-- 为什么改：
--   建立 public.categories 表，保存帖子分类，对应
--   docs/03_Database/Tables.md 第 7 节，并写入 7.3 节列出的三条固定
--   种子数据（rent / wanted / used）。
--
-- 影响哪些表：
--   新建 public.categories。
--   复用上一份迁移创建的 public.set_updated_at() 和 public.is_admin()。
--
-- 是否影响现有数据：
--   不影响，全新表；写入的三条种子数据是文档 7.3 节明确列出的固定分类，
--   不是随意插入的测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 特别说明（推断，非文档明文规定）：
--   Tables.md 第 22 节"RLS 基本原则"给出的最低清单里没有列出 categories，
--   但该节开头写明"所有暴露给浏览器访问的业务表必须启用 RLS"，
--   categories 会被前端读取，故按此通用原则启用。
--   下面 SELECT/INSERT/UPDATE 策略直接依据 7.5 节"权限原则"实现：
--   所有人可读取启用中的分类，只有管理员可以新增/修改/停用分类。

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_zh text not null,
  name_en text null default null,
  description text null default null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 7.4 节约束：slug 必须唯一
  constraint categories_slug_key unique (slug),
  -- 第 25 节数据验证：sort_order 不能小于 0
  constraint categories_sort_order_check check (sort_order >= 0)
);

comment on table public.categories is
  '帖子分类，参见 docs/03_Database/Tables.md 第 7 节。';

create trigger categories_set_updated_at
  before update on public.categories
  for each row
  execute function public.set_updated_at();

-- 第 22 节：启用 RLS
alter table public.categories enable row level security;

-- 7.5 权限原则

create policy categories_select_active_or_admin
  on public.categories
  for select
  to anon, authenticated
  using (
    is_active = true
    or public.is_admin()
  );

create policy categories_insert_admin_only
  on public.categories
  for insert
  to authenticated
  with check (
    public.is_admin()
  );

create policy categories_update_admin_only
  on public.categories
  for update
  to authenticated
  using (
    public.is_admin()
  )
  with check (
    public.is_admin()
  );

-- 7.3 节初始数据：rent / wanted / used
insert into public.categories (slug, name_zh, name_en, sort_order)
values
  ('rent', '租房', 'Rent', 1),
  ('wanted', '求租', 'Wanted', 2),
  ('used', '二手', 'Used', 3)
on conflict (slug) do nothing;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- delete from public.categories where slug in ('rent', 'wanted', 'used');
-- drop policy if exists categories_update_admin_only on public.categories;
-- drop policy if exists categories_insert_admin_only on public.categories;
-- drop policy if exists categories_select_active_or_admin on public.categories;
-- drop trigger if exists categories_set_updated_at on public.categories;
-- drop table if exists public.categories;
