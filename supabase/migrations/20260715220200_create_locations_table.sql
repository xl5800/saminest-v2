-- Migration: create locations table
--
-- 为什么改：
--   建立 public.locations 表，保存州/城市/区域等地理信息，对应
--   docs/03_Database/Tables.md 第 8 节，并写入 8.5 节列出的 DMV 常用地区。
--   同时补上 profiles.location_id 指向 locations.id 的外键约束
--   （create_profiles_table 迁移里因为 locations 还不存在，故意延后到
--   这份迁移里加，具体原因见那份文件的说明）。
--
-- 影响哪些表：
--   新建 public.locations。
--   alter table public.profiles：为 location_id 补充外键约束（不改变
--   该字段本身的类型/可空性/默认值，只是补上约束）。
--
-- 是否影响现有数据：
--   对 locations 本身不影响（全新表）。
--   对 profiles：如果在本迁移执行前 profiles.location_id 已经写入了
--   不存在于 locations 表的脏数据，补外键约束这一步会失败并回滚整个
--   迁移事务。当前阶段 profiles 表刚建立、预期没有数据，风险可控；
--   在已有真实数据的环境执行前，应先确认 profiles.location_id 现有值
--   （如果有）都能在 locations 里找到对应行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 特别说明（推断，非文档明文规定，请重点核对）：
--   1. Tables.md 第 8 节没有单独的"权限原则"小节。本迁移对 locations 的
--      RLS（公开可读启用中的地区、只有管理员可写）是类比第 7.5 节
--      （categories 的权限原则）做出的推断，因为两张表结构和用途相同
--      （管理员维护的公开枚举表）。如果后续文档补充了 locations 专属
--      权限原则且与本推断不同，需要另开迁移调整。
--   2. 8.4 节建议的 unique(parent_id, slug) 约束本身无法防止多条
--      parent_id 为 null 的顶层地区出现重复 slug（Postgres 里两个 null
--      在唯一约束中互不相等，不会触发冲突）。本迁移在文档要求的约束
--      之外，另加一个只覆盖 parent_id is null 情况的部分唯一索引，
--      让本次种子数据（全部是顶层地区）真正防止重复 slug；这是实现
--      层面的技术补充，不是新增业务字段或业务规则。
--   3. 文档 8.5 节只给出地名，没有给出 type/层级关系。本迁移采用扁平
--      结构（全部 parent_id 为 null，type 统一取 'city'），state_code
--      按真实地理归属填写（Washington, DC 记为 state_code = 'DC'，
--      其余按弗吉尼亚州 VA / 马里兰州 MD 填写），排序沿用文档列出的
--      先后顺序。是否需要 metro/state 层级关系，需要产品另行确认后
--      再用新的迁移补充，本迁移不擅自设计未列出的层级结构。

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid null default null references public.locations (id),
  type text not null,
  name text not null,
  slug text not null,
  state_code text null default null,
  country_code text not null default 'US',
  latitude numeric null default null,
  longitude numeric null default null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 8.4 节建议的联合唯一约束
  constraint locations_parent_slug_key unique (parent_id, slug),
  -- 8.3 节：type 可选值用数据库约束固定
  constraint locations_type_check
    check (type in ('country', 'state', 'metro', 'city', 'district', 'neighborhood')),
  -- 第 25 节数据验证：sort_order 不能小于 0
  constraint locations_sort_order_check check (sort_order >= 0)
);

comment on table public.locations is
  '州/城市/区域等地理信息，参见 docs/03_Database/Tables.md 第 8 节。';

-- 补充说明 2：8.4 节约束在 parent_id 为 null 时不足以防重复，
-- 额外补一个只覆盖顶层地区的部分唯一索引。
create unique index locations_root_slug_key
  on public.locations (slug)
  where parent_id is null;

create trigger locations_set_updated_at
  before update on public.locations
  for each row
  execute function public.set_updated_at();

-- 补上 create_profiles_table 迁移里延后的外键约束
alter table public.profiles
  add constraint profiles_location_id_fkey
  foreign key (location_id) references public.locations (id);

-- 第 22 节：启用 RLS（locations 同 categories，未在第 22 节最低清单中
-- 列出，按该节开头的通用原则启用，见补充说明 1）
alter table public.locations enable row level security;

create policy locations_select_active_or_admin
  on public.locations
  for select
  to anon, authenticated
  using (
    is_active = true
    or public.is_admin()
  );

create policy locations_insert_admin_only
  on public.locations
  for insert
  to authenticated
  with check (
    public.is_admin()
  );

create policy locations_update_admin_only
  on public.locations
  for update
  to authenticated
  using (
    public.is_admin()
  )
  with check (
    public.is_admin()
  );

-- 8.5 节列出的 DMV 常用地区种子数据（见补充说明 3）
insert into public.locations (slug, type, name, state_code, country_code, sort_order)
values
  ('washington-dc', 'city', 'Washington, DC', 'DC', 'US', 1),
  ('arlington', 'city', 'Arlington', 'VA', 'US', 2),
  ('alexandria', 'city', 'Alexandria', 'VA', 'US', 3),
  ('fairfax', 'city', 'Fairfax', 'VA', 'US', 4),
  ('tysons', 'city', 'Tysons', 'VA', 'US', 5),
  ('vienna', 'city', 'Vienna', 'VA', 'US', 6),
  ('reston', 'city', 'Reston', 'VA', 'US', 7),
  ('centreville', 'city', 'Centreville', 'VA', 'US', 8),
  ('manassas', 'city', 'Manassas', 'VA', 'US', 9),
  ('woodbridge', 'city', 'Woodbridge', 'VA', 'US', 10),
  ('rockville', 'city', 'Rockville', 'MD', 'US', 11),
  ('bethesda', 'city', 'Bethesda', 'MD', 'US', 12),
  ('silver-spring', 'city', 'Silver Spring', 'MD', 'US', 13),
  ('college-park', 'city', 'College Park', 'MD', 'US', 14)
on conflict (slug) where parent_id is null do nothing;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- delete from public.locations where slug in (
--   'washington-dc','arlington','alexandria','fairfax','tysons','vienna',
--   'reston','centreville','manassas','woodbridge','rockville','bethesda',
--   'silver-spring','college-park'
-- );
-- alter table public.profiles drop constraint if exists profiles_location_id_fkey;
-- drop policy if exists locations_update_admin_only on public.locations;
-- drop policy if exists locations_insert_admin_only on public.locations;
-- drop policy if exists locations_select_active_or_admin on public.locations;
-- drop trigger if exists locations_set_updated_at on public.locations;
-- drop index if exists locations_root_slug_key;
-- drop table if exists public.locations;
