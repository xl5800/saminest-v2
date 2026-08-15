-- Migration: 创建"一起去"（Go Together / 找搭子）功能的 activities / activity_participants 表结构
--
-- 为什么改：
--   补齐迁移文件缺口。activities 和 activity_participants 这两张表、及其
--   相关索引/触发器/RLS 策略，在 2026-08-15 04:23:54（UTC）时是直接在
--   Supabase Dashboard / MCP 上手工执行 SQL 创建的，没有走"数据库改动
--   必须走 migration"这条硬性规则（见 CLAUDE.md），导致 supabase/migrations/
--   里长期缺一份对应文件，本地开发库/CI 跑 migration 历史时复现不出这两张
--   表（20260815070000_create_activity_conversation_function.sql 的头部
--   注释里已经记录过这个已知缺口）。这份文件不改变线上任何东西（线上
--   早就是这个版本了），只是把当时实际执行过的 SQL 原样补进仓库，让
--   supabase/migrations/ 重新对得上 kdpzbpapnufvgbfgjgcr 项目的 migration
--   历史（对应线上 migration 版本号 20260815042354）。
--
-- 影响哪些表：
--   新建 public.activities、public.activity_participants 两张表及各自的
--   索引；新增函数 public.sync_activity_participant_count() 和触发器
--   activities_set_updated_at（复用已有的 public.set_updated_at()）、
--   activity_participants_sync_count（同步报名人数、联动 open/full 状态）；
--   两张表都开启 RLS 并各自新建若干条策略。不涉及任何已有表。
--
-- 是否影响现有数据：
--   不影响。这两张表在这份迁移之前不存在，线上执行时就是全新建表，没有
--   任何已有数据需要迁移。
--
-- 是否需要回滚方案：
--   技术上可以（见文件末尾注释），但强烈不建议——线上这两张表自
--   2026-08-15 创建以来已经在被"一起去"功能实际使用（报名记录、私信
--   通知等都依赖这两张表，见
--   20260815070000_create_activity_conversation_function.sql），回滚会
--   直接删表丢数据，不是"恢复到迁移前状态"这么简单。
--
-- 说明：
--   以下 SQL 是当时在线上实际执行过的原始语句，原样落盘，未做任何改动。

-- 一起去 (Go Together / 找搭子) v1
-- 参见 docs/01_Product/FindBuddy-Design.md

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  channel text not null default 'other'
    check (channel = any (array['food','carpool','fitness','game','study','travel','entertainment','other'])),
  tag_text text
    check (tag_text is null or (char_length(tag_text) >= 1 and char_length(tag_text) <= 20)),
  title text not null check (char_length(title) >= 1 and char_length(title) <= 120),
  description text not null check (char_length(description) >= 1 and char_length(description) <= 2000),
  location_id uuid references public.locations(id),
  landmark_text text
    check (landmark_text is null or (char_length(landmark_text) >= 1 and char_length(landmark_text) <= 100)),
  is_online boolean not null default false,
  start_at timestamptz not null,
  capacity integer check (capacity is null or capacity > 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  contact_method text
    check (contact_method is null or (contact_method = any (array['message','email','phone','wechat','other']))),
  contact_value text,
  status text not null default 'open'
    check (status = any (array['open','full','cancelled','ended'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.activities is '一起去（找搭子）活动，参见 docs/01_Product/FindBuddy-Design.md';

create index activities_channel_idx on public.activities (channel) where deleted_at is null;
create index activities_location_idx on public.activities (location_id) where deleted_at is null;
create index activities_organizer_idx on public.activities (organizer_id);
create index activities_start_at_idx on public.activities (start_at);

create table public.activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id),
  user_id uuid not null references public.profiles(id),
  joined_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (activity_id, user_id)
);

comment on table public.activity_participants is '一起去活动报名记录，参见 docs/01_Product/FindBuddy-Design.md';

create index activity_participants_activity_idx on public.activity_participants (activity_id);
create index activity_participants_user_idx on public.activity_participants (user_id);

alter table public.activities enable row level security;
alter table public.activity_participants enable row level security;

-- activities policies
create policy activities_select_public on public.activities
  for select
  using (deleted_at is null and status <> 'cancelled');

create policy activities_select_own on public.activities
  for select
  using (organizer_id = auth.uid());

create policy activities_insert_own on public.activities
  for insert
  with check (organizer_id = auth.uid() and not public.is_account_restricted());

create policy activities_update_own on public.activities
  for update
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

-- activity_participants policies
create policy activity_participants_select_organizer on public.activity_participants
  for select
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_participants.activity_id
        and a.organizer_id = auth.uid()
    )
  );

create policy activity_participants_select_joined on public.activity_participants
  for select
  using (
    exists (
      select 1 from public.activity_participants ap2
      where ap2.activity_id = activity_participants.activity_id
        and ap2.user_id = auth.uid()
        and ap2.cancelled_at is null
    )
  );

create policy activity_participants_insert_own on public.activity_participants
  for insert
  with check (
    user_id = auth.uid()
    and not public.is_account_restricted()
    and exists (
      select 1 from public.activities a
      where a.id = activity_participants.activity_id
        and a.deleted_at is null
        and a.status = 'open'
    )
  );

create policy activity_participants_update_own on public.activity_participants
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 复用现有通用 updated_at 触发器函数
create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- 报名人数同步 + 满员状态联动，单条 UPDATE 完成，避免触发器级联
create or replace function public.sync_activity_participant_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  delta integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is null then
      delta := 1;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.cancelled_at is null and new.cancelled_at is not null then
      delta := -1;
    elsif old.cancelled_at is not null and new.cancelled_at is null then
      delta := 1;
    end if;
  end if;

  if delta <> 0 then
    update public.activities
    set participant_count = greatest(participant_count + delta, 0),
        status = case
          when capacity is not null and greatest(participant_count + delta, 0) >= capacity and status = 'open' then 'full'
          when capacity is not null and greatest(participant_count + delta, 0) < capacity and status = 'full' then 'open'
          else status
        end
    where id = coalesce(new.activity_id, old.activity_id);
  end if;

  return new;
end;
$$;

create trigger activity_participants_sync_count
  after insert or update on public.activity_participants
  for each row execute function public.sync_activity_participant_count();

-- 回滚方案（默认不执行，需要人工确认后单独运行——强烈不建议，线上表
-- 已在使用中，回滚会删表丢数据）：
--
-- drop trigger if exists activity_participants_sync_count on public.activity_participants;
-- drop function if exists public.sync_activity_participant_count();
-- drop trigger if exists activities_set_updated_at on public.activities;
-- drop policy if exists activity_participants_update_own on public.activity_participants;
-- drop policy if exists activity_participants_insert_own on public.activity_participants;
-- drop policy if exists activity_participants_select_joined on public.activity_participants;
-- drop policy if exists activity_participants_select_organizer on public.activity_participants;
-- drop policy if exists activities_update_own on public.activities;
-- drop policy if exists activities_insert_own on public.activities;
-- drop policy if exists activities_select_own on public.activities;
-- drop policy if exists activities_select_public on public.activities;
-- drop table if exists public.activity_participants;
-- drop table if exists public.activities;
