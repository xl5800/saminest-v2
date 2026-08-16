-- activity_participants_select_joined 这条策略的 USING 子句是一个查自己表的
-- 自引用子查询（EXISTS (select ... from activity_participants ap2 ...)）——
-- Postgres RLS 对"策略里查询同一张表"这种自引用天然有递归风险：为了判断
-- ap2 那一行是否可见，又要套用同一条策略，这条策略又对 ap2 的 ap2 再套用
-- 一次……跟之前 activities <-> activity_participants 互相查对方触发的
-- 42P17 是同一类问题的另一种形态，只是这次是表查自己而不是两张表互查。
--
-- 修法跟 is_activity_participant() 一样：把自引用子查询包进一个
-- security definer 函数——postgres 角色有 bypassrls，函数内部再查
-- activity_participants 时不会重新触发这张表自己的 RLS 策略，从而打破
-- 自引用递归。

create or replace function public.is_fellow_activity_participant(target_activity_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.activity_participants ap2
    where ap2.activity_id = target_activity_id
      and ap2.user_id = auth.uid()
      and ap2.cancelled_at is null
  );
$$;

drop policy if exists activity_participants_select_joined on public.activity_participants;

create policy activity_participants_select_joined
  on public.activity_participants
  for select
  using (public.is_fellow_activity_participant(activity_id));
