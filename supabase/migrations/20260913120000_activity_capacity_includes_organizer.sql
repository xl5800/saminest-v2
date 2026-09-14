-- 任务卡（活动"人数上限"语义修正——上限包含发起人本人）：BARRY 发现一个
-- 数字不一致的 bug（截图：capacity=4、0 个非发起人参与者的拼车活动，界面
-- 同时显示"共 1 人参加"和"还差 4 人（0/4）"——两句话互相矛盾，如果发起人
-- 本来就占了 capacity 里的 1 个名额，应该显示"还差 3 人"才对）。
--
-- 调查结论：activity-participant-avatars.tsx 的头像格填充逻辑
-- （computeSlots）本来就是"capacity 含发起人"这个语义
-- （joinedCount = 1 + participants.length），截图里头像格视觉上已经正确
-- 画出了"1 个发起人头像 + 3 个虚线空位"（一共 4 格，等于 capacity）；真正
-- 没跟上的是 format.ts 里 formatActivityParticipantSummary 那一行"还差
-- N 人"文字（另一次迁移已经修正），以及这个触发器函数的"满员"判断——两处
-- 都是拿"不含发起人的参与者数"直接跟 capacity 比较，比正确的口径多算了
-- 1 个名额。
--
-- 这次改动：sync_activity_participant_count() 判断"要不要把活动状态切到
-- 'full'"（participant_count >= capacity）和"要不要从 'full' 切回 'open'"
-- （participant_count < capacity）这两个条件，都在跟 capacity 比较之前
-- 加 1（发起人本人）——`greatest(participant_count + delta, 0) + 1`，跟
-- format.ts 那次修正的 `participantCount + 1` 是同一个口径。除了这两处
-- 各加一个 `+ 1`，函数其它部分（delta 的计算、INSERT/UPDATE 两个分支、
-- participant_count 本身怎么增减）原样保留，不改——这张卡不改
-- "已批准参与者数"这个数字本身的计算方式，只改它跟 capacity 比较时要不要
-- 把发起人也算进去。
--
-- 明确决定（BARRY 确认）：不迁移/回填已有活动的 capacity 数值——老活动的
-- "还差 N 人"文字、"是否已满员"判断会因为这次语义变化自然少算 1 个名额，
-- 这是产品确认接受的结果，不需要额外一条 UPDATE 语句去调整历史数据。
--
-- 照抄 20260910120000_activity_participants_block_organizer_self_join.sql
-- 那种"create or replace/drop+recreate，只改一处、写清楚改了什么、为什么"
-- 的迁移风格：`create or replace function` 直接生效，不需要先 drop（返回
-- 类型/参数列表都没变）。
--
-- 本地验证（用 execute_sql 在本地 Supabase 上实测，不是只读代码）：
-- 见完工报告，覆盖了"capacity 刚好等于发起人+已批准参与者时状态切到
-- full"和"有人取消报名后状态从 full 切回 open"两个边界场景，均符合预期。

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
          -- +1：发起人本人。发起人从不出现在 activity_participants 表里
          -- （见 activities-repository.ts 的 listActivityParticipants 注
          -- 释），participant_count 本身只统计已批准的参与者行，跟
          -- capacity 比较前要把发起人也算进"已加入人数"。
          when capacity is not null and greatest(participant_count + delta, 0) + 1 >= capacity and status = 'open' then 'full'
          when capacity is not null and greatest(participant_count + delta, 0) + 1 < capacity and status = 'full' then 'open'
          else status
        end
    where id = coalesce(new.activity_id, old.activity_id);
  end if;

  return new;
end;
$$;

-- 回滚：把函数体改回不含 "+1" 的旧版本（跟 20260816175611_activity_join_approval.sql
-- 里最初定义的逐字一致）。
-- create or replace function public.sync_activity_participant_count()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $$
-- declare
--   old_counted boolean := false;
--   new_counted boolean := false;
--   delta integer := 0;
-- begin
--   if tg_op = 'INSERT' then
--     new_counted := (new.status = 'approved' and new.cancelled_at is null);
--     delta := case when new_counted then 1 else 0 end;
--   elsif tg_op = 'UPDATE' then
--     old_counted := (old.status = 'approved' and old.cancelled_at is null);
--     new_counted := (new.status = 'approved' and new.cancelled_at is null);
--     delta := (case when new_counted then 1 else 0 end) - (case when old_counted then 1 else 0 end);
--   end if;
--
--   if delta <> 0 then
--     update public.activities
--     set participant_count = greatest(participant_count + delta, 0),
--         status = case
--           when capacity is not null and greatest(participant_count + delta, 0) >= capacity and status = 'open' then 'full'
--           when capacity is not null and greatest(participant_count + delta, 0) < capacity and status = 'full' then 'open'
--           else status
--         end
--     where id = coalesce(new.activity_id, old.activity_id);
--   end if;
--
--   return new;
-- end;
-- $$;
