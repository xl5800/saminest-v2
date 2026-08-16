-- 为什么改：P1——"我的活动"管理页需要一个"我报名的"列表，展示用户曾经
-- 报名过的活动，包括活动之后被发起人取消（status='cancelled'）的情况。
-- 现有的 activities_select_public 会排除 status='cancelled' 的行，
-- activities_select_own 只覆盖发起人自己，两条都不能让参与者看到自己
-- 报名过、后来被取消的活动。这里加一条新的 select 策略，对称于
-- activities_select_own 的思路：只要用户在 activity_participants 里对
-- 这场活动有过一条记录（不限 cancelled_at 是否为空——不管当前是不是还
-- 报名中，都算"参与过"，应该能在自己的列表里看到这条历史），就允许读到
-- 这场活动，跟活动本身的 status/deleted_at 无关。

create policy activities_select_participant on public.activities
  for select
  using (
    exists (
      select 1 from public.activity_participants ap
      where ap.activity_id = activities.id
        and ap.user_id = auth.uid()
    )
  );
