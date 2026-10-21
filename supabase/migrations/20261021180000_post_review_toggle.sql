-- 分类信息帖子（招聘 / 房屋 / 二手 / 免费）审核开关。
--
-- 为什么改：
--   以前发帖一律进"待审核"，管理员通过后才显示。现在想让用户发帖更方便：
--   后台加一个开关，关掉时新帖子直接显示，以后觉得需要再打开。社区帖子和
--   找搭子活动本来就是直接显示的，不受影响。敏感词过滤、举报、屏蔽、管理员
--   下架 / 删除 / 封禁都照常工作。
--
-- 影响哪些表 / 函数：
--   - 新建 app_settings（全站设置，只有一行）。只有管理员能读；改只能走
--     set_post_review_enabled()。默认开启审核，跟现在的行为一样。
--   - 新增 post_review_enabled()：触发器和 RLS 策略用来读开关。
--   - 新增 set_post_review_enabled()：管理员改开关。
--   - posts 新增触发器 posts_auto_approve_when_review_disabled：开关关着时，
--     · 新发的帖子（status = 'pending'）直接改成 'approved'；
--     · 作者编辑已经通过的帖子时（前端会把 approved 改回 pending 重新审核），
--       保持 'approved'。
--     被驳回后"重新提交审核"的帖子仍然进待审核——那是管理员驳回过的内容，
--     改完还是要管理员再看一眼。
--   - 重建 posts_insert_own：多允许"开关关着时直接插入 approved"这一种情况
--     （RLS 的 with check 是在 BEFORE 触发器改完之后才检查的，不改这条策略，
--     触发器改成 approved 的新帖子会被拦下）。其余条件（只能用自己的 id、
--     账号没被限制）不变。posts_update_own_or_admin 不用改：编辑已通过的帖子
--     时触发器把状态保持成 approved，等于"状态没变"，原策略本来就放行。
--
-- 是否影响现有数据：
--   不影响。默认开启审核；切换开关时已有的待审核帖子不动，还在待审核列表里。
--
-- 回滚（默认不执行）：
--   drop trigger if exists posts_auto_approve_when_review_disabled on public.posts;
--   drop function if exists public.auto_approve_post_when_review_disabled();
--   drop function if exists public.set_post_review_enabled(boolean);
--   然后按 20260717000700_account_status_enforcement.sql 重建 posts_insert_own；
--   drop function if exists public.post_review_enabled();
--   drop table if exists public.app_settings;

-- ---------------------------------------------------------------------------
-- 1. 设置表
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  id boolean primary key default true,
  post_review_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint app_settings_single_row check (id)
);

comment on table public.app_settings is
  '全站设置，只有一行（id = true）。管理员可读；修改只能走 security definer 函数。';
comment on column public.app_settings.post_review_enabled is
  '分类信息帖子是否需要管理员审核后才显示。false 时新帖子直接显示。';

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin
  on public.app_settings
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. 读 / 改开关
-- ---------------------------------------------------------------------------

-- 找不到设置行时按"需要审核"处理，宁可多审也不误放。
create or replace function public.post_review_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.post_review_enabled from public.app_settings s where s.id), true);
$$;

revoke all on function public.post_review_enabled() from public, anon;
grant execute on function public.post_review_enabled() to authenticated;

create or replace function public.set_post_review_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change post review setting';
  end if;

  if enabled is null then
    raise exception 'enabled is required';
  end if;

  insert into public.app_settings (id, post_review_enabled, updated_at, updated_by)
  values (true, enabled, now(), auth.uid())
  on conflict (id) do update
    set post_review_enabled = excluded.post_review_enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_post_review_enabled(boolean) from public, anon;
grant execute on function public.set_post_review_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 开关关着时自动通过
-- ---------------------------------------------------------------------------

create or replace function public.auto_approve_post_when_review_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'pending' or public.post_review_enabled() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'approved';
  elsif old.status = 'approved' then
    -- 编辑已通过的帖子：不再退回待审核。
    new.status := 'approved';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_auto_approve_when_review_disabled on public.posts;
create trigger posts_auto_approve_when_review_disabled
  before insert or update of status on public.posts
  for each row execute function public.auto_approve_post_when_review_disabled();

-- ---------------------------------------------------------------------------
-- 4. 允许开关关着时直接插入 approved
-- ---------------------------------------------------------------------------

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or status in ('draft', 'pending')
      or (status = 'approved' and not public.post_review_enabled())
    )
    and not public.is_account_restricted()
  );
