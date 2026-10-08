-- 社区功能 阶段一：comments 表支持挂在社区帖子下面，跟挂在帖子/活动下面
-- 是同一张表、同一套"恰好一个目标非空"约束模式。

alter table public.comments
  add column community_post_id uuid references public.community_posts(id);

alter table public.comments drop constraint comments_target_check;

alter table public.comments add constraint comments_target_check
  check (num_nonnulls(post_id, activity_id, community_post_id) = 1);
