-- 补录：线上数据库里有一批改动是直接在数据库上做的（没有 migration 文件，
-- supabase_migrations.schema_migrations 里也没有记录），导致仓库从头重放
-- （supabase db reset）跟线上不一致，重放到 20261008033100 时报
-- "constraint comments_target_check does not exist"。
--
-- 这个文件把那些改动按 2026-10-09 从线上读到的实际定义还原出来，插在
-- 20261008033100 之前，保证本地重放能接上后面的 migration。
--
-- !! 线上已经有这些改动，线上不要再执行这个文件 !!
-- 推送前先在线上把它标记成"已应用"（只写一条记录，不执行 SQL）：
--   supabase migration repair --status applied 20261008033090
-- 即使误执行也是安全的：每一步都写成了可重复执行的形式（if not exists /
-- if exists / drop policy if exists），结果跟线上现状一致。
--
-- 还原的内容：
-- 1. 找搭子活动支持评论（应用里活动详情页的评论功能依赖这些）：
--    - activities.comment_count（评论数，触发器维护）+ 非负约束；
--    - comments.activity_id（外键到 activities）；comments.post_id 改为可空；
--    - comments_target_check：一条评论恰好挂在一个对象上（帖子或活动）——
--      20261008033100 会把它改成同时支持社区帖子；
--    - comments 的三条 RLS 策略加上活动分支（insert_own / select / delete_own），
--      跟线上一样不带 TO 子句（作用于 public）；
--    - sync_post_comment_count 触发器函数加上活动分支（20261008035059 之后又
--      加了社区帖子分支）。
-- 2. 手机号注册：profiles.phone（可空，部分唯一索引 + 格式约束）。线上对
--    anon / authenticated 收回了 profiles 的表级 SELECT，只按列授权、唯独不
--    授权 phone——手机号不能被任何客户端读到。这里原样还原这套列级授权。
--
-- 线上还有一张 diag_visibility_test 表（看名字是排查问题时临时建的测试表），
-- 应用不使用，这里故意不补录。

-- 1. 活动评论 ------------------------------------------------------------

alter table public.activities
  add column if not exists comment_count bigint not null default 0;

alter table public.activities
  drop constraint if exists activities_comment_count_check;
alter table public.activities
  add constraint activities_comment_count_check check (comment_count >= 0);

alter table public.comments
  add column if not exists activity_id uuid references public.activities (id);

alter table public.comments
  alter column post_id drop not null;

alter table public.comments
  drop constraint if exists comments_target_check;
alter table public.comments
  add constraint comments_target_check check (num_nonnulls(post_id, activity_id) = 1);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments
  for insert
  with check (
    user_id = auth.uid()
    and not public.is_account_restricted()
    and (
      (
        post_id is not null
        and exists (
          select 1
          from public.posts p
          where p.id = comments.post_id
            and p.deleted_at is null
            and (
              (p.status = 'approved' and p.visibility = 'public')
              or p.author_id = auth.uid()
            )
        )
      )
      or (
        activity_id is not null
        and exists (
          select 1
          from public.activities a
          where a.id = comments.activity_id
            and a.deleted_at is null
            and (a.status <> 'cancelled' or a.organizer_id = auth.uid())
        )
      )
    )
    and (
      parent_id is null
      or (
        (select s.post_id from public.get_comment_snapshot(comments.parent_id) s) is not distinct from post_id
        and (select s.activity_id from public.get_comment_snapshot(comments.parent_id) s) is not distinct from activity_id
      )
    )
  );

drop policy if exists comments_select_of_approved_or_own_posts on public.comments;
create policy comments_select_of_approved_or_own_posts
  on public.comments
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'approved'
        and p.visibility = 'public'
        and p.deleted_at is null
    )
    or exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
    or exists (
      select 1
      from public.activities a
      where a.id = comments.activity_id
        and a.deleted_at is null
        and a.status <> 'cancelled'
    )
    or exists (
      select 1
      from public.activities a
      where a.id = comments.activity_id
        and a.organizer_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
  on public.comments
  for update
  using (
    user_id = auth.uid()
    and deleted_at is null
  )
  with check (
    user_id = (select s.user_id from public.get_comment_snapshot(comments.id) s)
    and post_id is not distinct from (select s.post_id from public.get_comment_snapshot(comments.id) s)
    and activity_id is not distinct from (select s.activity_id from public.get_comment_snapshot(comments.id) s)
    and parent_id is not distinct from (select s.parent_id from public.get_comment_snapshot(comments.id) s)
    and content = (select s.content from public.get_comment_snapshot(comments.id) s)
  );

create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.post_id is not null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    elsif new.activity_id is not null then
      update public.activities set comment_count = comment_count + 1 where id = new.activity_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      if new.post_id is not null then
        update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
      elsif new.activity_id is not null then
        update public.activities set comment_count = greatest(comment_count - 1, 0) where id = new.activity_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

-- 2. 手机号 --------------------------------------------------------------

alter table public.profiles
  add column if not exists phone text null;

alter table public.profiles
  drop constraint if exists profiles_phone_format_check;
alter table public.profiles
  add constraint profiles_phone_format_check
  check (phone is null or phone ~ '^\+?[0-9]{10,15}$');

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null;

-- 收回表级 SELECT，按列授权（不含 phone）。其它表级权限（INSERT / UPDATE /
-- DELETE 等）保持不变，跟线上一致；行级可见性仍由 RLS 策略决定。
revoke select on public.profiles from anon, authenticated;
grant select (
  id,
  display_name,
  avatar_url,
  bio,
  location_id,
  role,
  account_status,
  is_verified,
  last_active_at,
  created_at,
  updated_at,
  deleted_at,
  age
) on public.profiles to anon, authenticated;
