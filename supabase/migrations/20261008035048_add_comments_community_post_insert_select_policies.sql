-- 社区功能 阶段一：comments 表对社区帖子场景的 INSERT/SELECT 策略。
--
-- 故意用新增的两条 PERMISSIVE 策略，而不是改写 comments_insert_own/
-- comments_select_of_approved_or_own_posts 这两条已有策略——Postgres 对
-- 同一个操作的多条 PERMISSIVE 策略取 OR 组合，新增策略只覆盖
-- community_post_id 非空的行，完全不影响帖子/活动评论原有的两条策略。
-- （这是实际开发过程中为了绕开 Supabase MCP 工具在这张表上 DROP POLICY
-- 语句会挂起的已知问题而选的写法，不是随意的设计决定——以后要改这两条
-- 已有策略本身时需要注意这个工具限制仍可能存在。）

create policy comments_insert_community_post on public.comments
  for insert
  with check (
    user_id = auth.uid()
    and not is_account_restricted()
    and community_post_id is not null
    and exists (
      select 1 from public.community_posts cp
      where cp.id = comments.community_post_id
        and cp.deleted_at is null
        and (cp.status = 'approved' or cp.author_id = auth.uid())
    )
    and (
      parent_id is null
      or (
        (select s.post_id from public.get_comment_snapshot(comments.parent_id) s) is not distinct from post_id
        and (select s.activity_id from public.get_comment_snapshot(comments.parent_id) s) is not distinct from activity_id
        and (select s.community_post_id from public.get_comment_snapshot(comments.parent_id) s) is not distinct from community_post_id
      )
    )
  );

create policy comments_select_community_post on public.comments
  for select
  using (
    exists (
      select 1 from public.community_posts cp
      where cp.id = comments.community_post_id
        and cp.status = 'approved'
        and cp.deleted_at is null
    )
    or exists (
      select 1 from public.community_posts cp
      where cp.id = comments.community_post_id
        and cp.author_id = auth.uid()
    )
  );
