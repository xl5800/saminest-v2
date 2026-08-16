-- 为什么改：P0——活动（一起去）目前没有任何举报/审核机制，reports 表的
-- target_type 只允许 'post'/'comment'，活动发出去后没人能举报、管理员也
-- 没法下架。这里只放开 target_type 的枚举，不新增表、不新增函数——
-- resolve_report()/dismiss_report() 和 reports 的 RLS 策略
-- （reports_insert_own/reports_select_own_or_admin）本来就是完全泛化的，
-- 不关心 target_type 具体是什么值，加一个 'activity' 选项不需要动它们。

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['post', 'comment', 'activity']));
