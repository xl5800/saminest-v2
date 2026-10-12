-- Migration: 管理员编辑社区、关闭（归档）/恢复社区
--
-- 为什么改：
--   社区上线之后（官方种子社区，或用户申请通过的社区），后台没有任何办法
--   修改社区信息或下线社区。这一版只给管理员（社区主这一版没有管理权限）：
--     1. admin_update_community：改名称、简介、覆盖的州、是否官方。
--        校验规则跟 request_community 一致（名称 2-30 字、不跟其它已上线/
--        审核中的社区重名、简介最多 200 字、至少一个两位大写州代码）。
--        slug 不改——已经分享出去的社区链接不能失效。
--     2. admin_archive_community：关闭社区（status active → archived），
--        原因必填，写进 moderation_actions，并通过系统通知告诉社区创建人
--        （官方/种子社区 created_by 为空，不通知）。官方社区（is_official）
--        不允许关闭，避免误操作把主社区关掉——需要的话先在编辑里取消官方。
--        不做真删除：community_members / community_posts 都有指向
--        communities 的外键，而且关闭后要能恢复，成员和帖子数据全部保留。
--     3. admin_restore_community：恢复（archived → active），同样记录并通知
--        创建人。
--     4. community_posts 的公开读取分支补上"所属社区是 active"：关闭后，
--        这个社区的帖子不再出现在首页聚合流、社区内搜索、全站搜索里。
--        作者本人和管理员的读取分支不变（作者仍能在"我的"里看到自己的帖子，
--        管理员后台仍能看到全部）。社区本身的读取规则
--        （communities_select_active_or_admin）原来就只对公开用户放行
--        active，关闭后普通用户打开旧链接会读不到这个社区。
--        发新帖原来就要求社区是 active（community_posts_insert_own），不用改。
--
-- 影响哪些表/函数：
--   不新建表、不改列。moderation_actions.action_type 的 check 约束新增
--   'update_community' / 'archive_community' / 'restore_community'；
--   新增三个 security definer 函数（只有管理员能执行，函数内部
--   is_admin() 校验，anon 无执行权限）；重建 community_posts 的
--   community_posts_select_public_or_own 策略。
--
-- 是否影响现有数据：
--   不修改任何现有行。线上目前没有 archived 状态的社区，策略改动不会让任何
--   现有帖子从前台消失。
--
-- 是否需要回滚方案：
--   需要，见文件末尾注释（默认不执行）。

-- ---------------------------------------------------------------------
-- 1. moderation_actions.action_type 新增三种
-- ---------------------------------------------------------------------
alter table public.moderation_actions
  drop constraint moderation_actions_action_type_check;
alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
  check (
    action_type in (
      'approve_post',
      'reject_post',
      'archive_post',
      'restore_post',
      'restrict_user',
      'suspend_user',
      'restore_user',
      'resolve_report',
      'dismiss_report',
      'delete_comment',
      'cancel_activity',
      'delete_activity',
      'delist_post',
      'delete_community_post',
      'delist_community_post',
      'approve_community',
      'reject_community',
      'update_community',
      'archive_community',
      'restore_community'
    )
  );

-- ---------------------------------------------------------------------
-- 2. admin_update_community
-- ---------------------------------------------------------------------
create or replace function public.admin_update_community(
  target_community_id uuid,
  community_name text,
  community_description text,
  community_state_codes text[],
  community_is_official boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(both from community_name);
  v_description text := nullif(trim(both from coalesce(community_description, '')), '');
  v_state_codes text[];
begin
  if not public.is_admin() then
    raise exception 'only admins can update communities';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 30 then
    raise exception 'community name must be 2-30 characters';
  end if;

  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'community description must be at most 200 characters';
  end if;

  select array_agg(distinct upper(trim(both from code)) order by upper(trim(both from code)))
  into v_state_codes
  from unnest(coalesce(community_state_codes, '{}'::text[])) as code
  where trim(both from code) <> '';

  if v_state_codes is null or cardinality(v_state_codes) = 0 then
    raise exception 'at least one state is required';
  end if;

  if exists (select 1 from unnest(v_state_codes) as code where code !~ '^[A-Z]{2}$') then
    raise exception 'invalid state code';
  end if;

  if exists (
    select 1 from public.communities
    where lower(name) = lower(v_name)
      and status in ('active', 'pending')
      and id <> target_community_id
  ) then
    raise exception 'community name already taken';
  end if;

  update public.communities
  set name = v_name,
      description = v_description,
      state_codes = v_state_codes,
      is_official = coalesce(community_is_official, is_official),
      updated_at = now()
  where id = target_community_id
    and status in ('active', 'archived');

  if not found then
    raise exception 'community % is not active or archived (or does not exist)', target_community_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'update_community', 'community', target_community_id);
end;
$$;

revoke execute on function public.admin_update_community(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.admin_update_community(uuid, text, text, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. admin_archive_community（关闭）
-- ---------------------------------------------------------------------
create or replace function public.admin_archive_community(
  target_community_id uuid,
  archive_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from archive_note);
  v_creator uuid;
  v_name text;
  v_is_official boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can archive communities';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'archive_note is required';
  end if;

  select is_official into v_is_official
  from public.communities
  where id = target_community_id;

  if v_is_official then
    raise exception 'official communities cannot be archived';
  end if;

  update public.communities
  set status = 'archived',
      updated_at = now()
  where id = target_community_id
    and status = 'active'
  returning created_by, name into v_creator, v_name;

  if not found then
    raise exception 'community % is not active (already archived, or does not exist)', target_community_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'archive_community', 'community', target_community_id, v_note);

  if v_creator is not null then
    perform public.notify_user(
      v_creator,
      '社区已关闭',
      format('你创建的社区「%s」已被管理员关闭：%s', v_name, v_note),
      null
    );
  end if;
end;
$$;

revoke execute on function public.admin_archive_community(uuid, text) from public, anon;
grant execute on function public.admin_archive_community(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. admin_restore_community（恢复）
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_community(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_name text;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'only admins can restore communities';
  end if;

  -- 关闭期间可能有人申请了同名社区并通过了，恢复前同样检查重名。
  if exists (
    select 1 from public.communities other, public.communities target
    where target.id = target_community_id
      and other.id <> target.id
      and lower(other.name) = lower(target.name)
      and other.status in ('active', 'pending')
  ) then
    raise exception 'community name already taken';
  end if;

  update public.communities
  set status = 'active',
      updated_at = now()
  where id = target_community_id
    and status = 'archived'
  returning created_by, name, slug into v_creator, v_name, v_slug;

  if not found then
    raise exception 'community % is not archived (or does not exist)', target_community_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'restore_community', 'community', target_community_id);

  if v_creator is not null then
    perform public.notify_user(
      v_creator,
      '社区已恢复',
      format('你创建的社区「%s」已恢复上线。', v_name),
      format('/community/%s', v_slug)
    );
  end if;
end;
$$;

revoke execute on function public.admin_restore_community(uuid) from public, anon;
grant execute on function public.admin_restore_community(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. community_posts 公开读取：所属社区必须是 active
-- ---------------------------------------------------------------------
-- 子查询读 communities 会经过 communities 自己的 RLS，公开用户本来就能读到
-- active 的社区，所以 exists (... status = 'active') 对所有人都能正确求值；
-- 写法跟 community_posts_insert_own 里同样的社区状态判断一致。
drop policy if exists community_posts_select_public_or_own on public.community_posts;

create policy community_posts_select_public_or_own on public.community_posts
  for select
  using (
    (
      status = 'approved'
      and deleted_at is null
      and exists (
        select 1 from public.communities c
        where c.id = community_posts.community_id
          and c.status = 'active'
      )
    )
    or author_id = auth.uid()
    or public.is_admin()
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists community_posts_select_public_or_own on public.community_posts;
-- create policy community_posts_select_public_or_own on public.community_posts
--   for select
--   using ((status = 'approved' and deleted_at is null) or author_id = auth.uid() or public.is_admin());
--
-- drop function if exists public.admin_restore_community(uuid);
-- drop function if exists public.admin_archive_community(uuid, text);
-- drop function if exists public.admin_update_community(uuid, text, text, text[], boolean);
--
-- （moderation_actions.action_type 的约束如需回滚，先确认表里没有新增的
--  三种 action_type 记录，再按 20261010043000_community_creation_requests.sql
--  里的列表重建。）
