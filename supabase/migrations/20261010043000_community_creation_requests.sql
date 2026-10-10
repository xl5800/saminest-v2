-- 用户申请创建社区，管理员审核通过后才上线。
--
-- 产品决定（2026-10-10）：
-- - 普通用户可以申请创建社区，必须管理员审核通过才对外可见；
-- - 申请通过后申请人自动成为这个社区的成员，角色记为 'owner'，但这一版
--   社区主没有任何管理权限（不能置顶、删帖、踢人），社区里的内容仍由管理员
--   在后台处理——所以这里不改 community_posts / community_members 的任何
--   权限策略；
-- - 申请 / 审核结果用系统通知（notify_user）告诉申请人。
--
-- 1. communities 表
--    - status 新增 'pending'（审核中）和 'rejected'（已驳回）；
--    - created_by：申请人（官方社区为 null）；rejection_reason：驳回原因。
--    - SELECT 策略加上"申请人能看到自己申请的社区"，否则申请人在"我的申请"
--      里看不到审核中 / 被驳回的记录。前端公开列表（listCommunities）会显式
--      只取 status = 'active'，不再只靠 RLS（管理员能看到全部状态）。
--    - 不开放普通用户直接 INSERT：communities_insert_admin 保持不变，用户只能
--      通过下面的 security definer 函数提交申请，校验规则集中在函数里。
--
-- 2. request_community(name, description, state_codes)：用户提交申请。
--    门槛：已登录、账号未受限、同一时间只能有一个审核中的申请、社区名 2-30 字
--    且不能跟已上线 / 审核中的社区重名（不区分大小写）、简介最多 200 字、至少
--    选一个州（两位大写州代码）。slug 由函数生成随机值（社区名多为中文，不适合
--    直接做 URL），is_official 固定 false。
--
-- 3. admin_approve_community(id) / admin_reject_community(id, reason)：
--    管理员审核，只能处理 status = 'pending' 的申请。通过时把申请人以 'owner'
--    角色加入 community_members（member_count 由现有触发器自动 +1）；两者都
--    写 moderation_actions 日志并通知申请人。

alter table public.communities
  add column if not exists created_by uuid null references public.profiles (id),
  add column if not exists rejection_reason text null;

alter table public.communities
  drop constraint communities_status_check;
alter table public.communities
  add constraint communities_status_check
  check (status = any (array['active', 'archived', 'pending', 'rejected']));

drop policy if exists communities_select_active_or_admin on public.communities;
create policy communities_select_active_or_admin on public.communities
  for select
  using (status = 'active' or created_by = auth.uid() or public.is_admin());

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
      'reject_community'
    )
  );

create or replace function public.request_community(
  community_name text,
  community_description text,
  community_state_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(both from community_name);
  v_description text := nullif(trim(both from coalesce(community_description, '')), '');
  v_state_codes text[];
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if public.is_account_restricted() then
    raise exception 'account restricted';
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
    where created_by = v_user_id and status = 'pending'
  ) then
    raise exception 'you already have a pending community request';
  end if;

  if exists (
    select 1 from public.communities
    where lower(name) = lower(v_name) and status in ('active', 'pending')
  ) then
    raise exception 'community name already taken';
  end if;

  insert into public.communities (name, slug, description, is_official, status, state_codes, created_by)
  values (
    v_name,
    'c-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    v_description,
    false,
    'pending',
    v_state_codes,
    v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.request_community(text, text, text[]) from public, anon;
grant execute on function public.request_community(text, text, text[]) to authenticated;

create or replace function public.admin_approve_community(target_community_id uuid)
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
    raise exception 'only admins can approve communities';
  end if;

  update public.communities
  set status = 'active',
      rejection_reason = null,
      updated_at = now()
  where id = target_community_id
    and status = 'pending'
  returning created_by, name, slug into v_creator, v_name, v_slug;

  if not found then
    raise exception 'community % is not pending (already processed, or does not exist)', target_community_id;
  end if;

  if v_creator is not null then
    insert into public.community_members (community_id, user_id, role)
    values (target_community_id, v_creator, 'owner')
    on conflict (community_id, user_id) do update set role = 'owner';
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'approve_community', 'community', target_community_id);

  if v_creator is not null then
    perform public.notify_user(
      v_creator,
      '社区申请已通过',
      format('你申请的社区「%s」已通过审核，你已自动加入这个社区。', v_name),
      format('/community/%s', v_slug)
    );
  end if;
end;
$$;

revoke execute on function public.admin_approve_community(uuid) from public, anon;
grant execute on function public.admin_approve_community(uuid) to authenticated;

create or replace function public.admin_reject_community(
  target_community_id uuid,
  rejection_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from rejection_note);
  v_creator uuid;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'only admins can reject communities';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'rejection_note is required';
  end if;

  update public.communities
  set status = 'rejected',
      rejection_reason = v_note,
      updated_at = now()
  where id = target_community_id
    and status = 'pending'
  returning created_by, name into v_creator, v_name;

  if not found then
    raise exception 'community % is not pending (already processed, or does not exist)', target_community_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'reject_community', 'community', target_community_id, v_note);

  if v_creator is not null then
    perform public.notify_user(
      v_creator,
      '社区申请未通过',
      format('你申请的社区「%s」未通过审核：%s', v_name, v_note),
      '/community/create'
    );
  end if;
end;
$$;

revoke execute on function public.admin_reject_community(uuid, text) from public, anon;
grant execute on function public.admin_reject_community(uuid, text) to authenticated;
