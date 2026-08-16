-- posts 表的 SELECT 策略里带了 is_admin() 兜底（posts_select_public_or_own_or_admin），
-- activities 表当初没加——导致管理员在处理"活动"类举报时，如果自己既不是
-- 发起人也不是参与者、活动又已经 cancelled（或其它被 activities_select_public
-- 排除的状态），会被 RLS 直接挡住，点举报队列里的链接看不到活动详情。
-- 跟 activities_select_own/_select_public/_select_participant 一样，新增
-- 一条独立的 permissive SELECT 策略（互相 OR），不改动现有三条。
create policy activities_select_admin
  on public.activities
  for select
  using (public.is_admin());
