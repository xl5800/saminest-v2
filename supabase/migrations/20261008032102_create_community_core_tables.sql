-- 社区功能 阶段一：核心数据表（communities / community_members / community_posts）
-- MVP 范围：单一 DMV 社区，不做按州/话题拆分，不做图片支持（见任务卡）。
-- 本文件内容已跟远程数据库的实际结构逐项核对一致（表结构/约束/策略/函数/
-- 触发器/种子数据），用于补齐本地 migrations 目录——这条迁移在远程数据库
-- 上已经真实执行过，这里只是把它的内容还原成本地文件，不需要也不应该再对
-- 远程重复执行（配合 `supabase migration repair --status applied` 使用）。

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_official boolean not null default true,
  status text not null default 'active' check (status = any (array['active', 'archived'])),
  member_count bigint not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities(id),
  user_id uuid not null references public.profiles(id),
  role text not null default 'member' check (role = any (array['member', 'moderator', 'admin', 'owner'])),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id),
  author_id uuid not null references public.profiles(id),
  post_type text not null default 'discussion'
    check (post_type = any (array['discussion', 'question', 'help', 'recommend', 'local_info', 'share'])),
  title text check (title is null or (char_length(title) >= 1 and char_length(title) <= 120)),
  body text not null check (char_length(body) >= 1 and char_length(body) <= 10000),
  status text not null default 'approved' check (status = any (array['approved', 'rejected', 'archived', 'deleted'])),
  pinned boolean not null default false,
  comment_count bigint not null default 0 check (comment_count >= 0),
  favorite_count bigint not null default 0 check (favorite_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;

create policy communities_select_active_or_admin on public.communities
  for select
  using (status = 'active' or public.is_admin());

create policy communities_insert_admin on public.communities
  for insert
  to authenticated
  with check (public.is_admin());

create policy communities_update_admin on public.communities
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy community_members_select_own_or_admin on public.community_members
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy community_members_insert_own on public.community_members
  for insert
  to authenticated
  with check (user_id = auth.uid() and not public.is_account_restricted());

create policy community_members_delete_own on public.community_members
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy community_posts_select_public_or_own on public.community_posts
  for select
  using ((status = 'approved' and deleted_at is null) or author_id = auth.uid() or public.is_admin());

create policy community_posts_insert_own on public.community_posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and not public.is_account_restricted()
    and exists (select 1 from public.communities c where c.id = community_posts.community_id and c.status = 'active')
    and exists (select 1 from public.community_members cm where cm.community_id = community_posts.community_id and cm.user_id = auth.uid())
  );

/**
 * SECURITY DEFINER 快照函数：跟 get_post_snapshot/get_comment_snapshot 是
 * 同一个模式——只能读到当前用户自己的（或管理员的）那一行，用在下面的
 * UPDATE 策略 with check 里，防止作者在更新时顺手篡改 status/comment_count/
 * favorite_count/community_id 这些系统维护的字段。
 */
create or replace function public.get_community_post_snapshot(target_id uuid)
returns public.community_posts
language sql
stable security definer
set search_path = public
as $$
  select *
  from public.community_posts
  where id = target_id
    and (author_id = auth.uid() or public.is_admin());
$$;

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
    )
  );

/**
 * community_members 变化时同步 communities.member_count，跟
 * sync_post_comment_count/sync_post_favorite_count 是同一个"触发器维护
 * 计数列"模式。
 */
create or replace function public.sync_community_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set member_count = member_count + 1 where id = new.community_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.communities set member_count = greatest(member_count - 1, 0) where id = old.community_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger communities_set_updated_at
  before update on public.communities
  for each row execute function public.set_updated_at();

create trigger community_posts_set_updated_at
  before update on public.community_posts
  for each row execute function public.set_updated_at();

create trigger community_members_after_insert_sync_count
  after insert on public.community_members
  for each row execute function public.sync_community_member_count();

create trigger community_members_after_delete_sync_count
  after delete on public.community_members
  for each row execute function public.sync_community_member_count();

insert into public.communities (id, name, slug, is_official, status)
values ('9a00984b-0888-4baf-9325-989d266cb5ea', 'DMV 华人社区', 'dmv', true, 'active');
