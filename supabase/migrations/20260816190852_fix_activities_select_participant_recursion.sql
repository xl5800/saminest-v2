-- 修复 activities_select_participant 与 activity_participants_select_organizer
-- 互相查询对方表触发的 RLS 无限递归（42P17: infinite recursion detected in
-- policy for relation "activities"）。
--
-- 复用项目已有的 security definer 函数模式（is_account_restricted /
-- is_active_conversation_member）：函数以 security definer 执行，不受
-- activity_participants 表 RLS 约束，从而打破 activities <-> activity_participants
-- 两张表的策略互相子查询对方造成的循环。

create or replace function public.is_activity_participant(target_activity_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.activity_participants ap
    where ap.activity_id = target_activity_id
      and ap.user_id = auth.uid()
  );
$$;

drop policy if exists activities_select_participant on public.activities;

create policy activities_select_participant
  on public.activities
  for select
  using (public.is_activity_participant(id));
