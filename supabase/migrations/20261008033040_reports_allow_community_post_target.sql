-- 社区功能 阶段一：reports.target_type 增加 'community_post' 这一种可举报
-- 的目标类型，跟举报帖子/评论/活动/用户是同一张表、同一套约束。

alter table public.reports drop constraint reports_target_type_check;

alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['post', 'comment', 'activity', 'user', 'community_post']));
