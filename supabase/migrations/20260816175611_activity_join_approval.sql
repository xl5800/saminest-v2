-- P2：报名审核制（可选，per-activity 开关）。发起人发布活动时可以选择
-- "需要我同意才能加入"，默认关闭（保持现在的秒进体验）。开启后，报名先
-- 落地为 pending，发起人同意/拒绝之后才变成 approved/rejected，只有
-- approved 且 cancelled_at is null 才计入 participant_count/占用名额。

alter table public.activities
  add column requires_approval boolean not null default false;

alter table public.activity_participants
  add column status text not null default 'approved'
    check (status = any (array['pending', 'approved', 'rejected']));

drop policy activity_participants_insert_own on public.activity_participants;
create policy activity_participants_insert_own on public.activity_participants
  for insert
  with check (
    activity_participants.user_id = auth.uid()
    and not public.is_account_restricted()
    and exists (
      select 1 from public.activities a
      where a.id = activity_participants.activity_id
        and a.deleted_at is null
        and a.status = 'open'
        and (
          (a.requires_approval = false and activity_participants.status = 'approved')
          or (a.requires_approval = true and activity_participants.status = 'pending')
        )
    )
  );

drop policy activity_participants_update_own on public.activity_participants;
create policy activity_participants_update_own on public.activity_participants
  for update
  using (activity_participants.user_id = auth.uid())
  with check (
    activity_participants.user_id = auth.uid()
    and (
      activity_participants.cancelled_at is not null
      or (
        activity_participants.status <> 'rejected'
        and exists (
          select 1 from public.activities a
          where a.id = activity_participants.activity_id
            and a.deleted_at is null
            and a.status = 'open'
        )
      )
    )
  );

revoke update (status) on public.activity_participants from authenticated, anon;

create or replace function public.sync_activity_participant_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  old_counted boolean := false;
  new_counted boolean := false;
  delta integer := 0;
begin
  if tg_op = 'INSERT' then
    new_counted := (new.status = 'approved' and new.cancelled_at is null);
    delta := case when new_counted then 1 else 0 end;
  elsif tg_op = 'UPDATE' then
    old_counted := (old.status = 'approved' and old.cancelled_at is null);
    new_counted := (new.status = 'approved' and new.cancelled_at is null);
    delta := (case when new_counted then 1 else 0 end) - (case when old_counted then 1 else 0 end);
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

create or replace function public.approve_activity_participant(target_participant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_organizer_id uuid;
begin
  select a.organizer_id into v_organizer_id
  from public.activity_participants ap
  join public.activities a on a.id = ap.activity_id
  where ap.id = target_participant_id;

  if v_organizer_id is null then
    raise exception 'participant record % not found', target_participant_id;
  end if;

  if v_organizer_id <> auth.uid() then
    raise exception 'only the activity organizer can approve participants';
  end if;

  update public.activity_participants
  set status = 'approved'
  where id = target_participant_id
    and status = 'pending';

  if not found then
    raise exception 'participant % is not pending (already processed, or does not exist)', target_participant_id;
  end if;
end;
$$;

create or replace function public.reject_activity_participant(target_participant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_organizer_id uuid;
begin
  select a.organizer_id into v_organizer_id
  from public.activity_participants ap
  join public.activities a on a.id = ap.activity_id
  where ap.id = target_participant_id;

  if v_organizer_id is null then
    raise exception 'participant record % not found', target_participant_id;
  end if;

  if v_organizer_id <> auth.uid() then
    raise exception 'only the activity organizer can reject participants';
  end if;

  update public.activity_participants
  set status = 'rejected'
  where id = target_participant_id
    and status = 'pending';

  if not found then
    raise exception 'participant % is not pending (already processed, or does not exist)', target_participant_id;
  end if;
end;
$$;

revoke execute on function public.approve_activity_participant(uuid) from public;
grant execute on function public.approve_activity_participant(uuid) to authenticated;
revoke execute on function public.reject_activity_participant(uuid) from public;
grant execute on function public.reject_activity_participant(uuid) to authenticated;
