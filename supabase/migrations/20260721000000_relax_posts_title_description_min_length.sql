-- Migration: relax posts.title / posts.description minimum length
--
-- 为什么改：
--   产品侧确认放宽发帖门槛：title 最小长度从 5 降到 1，description 最小
--   长度从 10 降到 1（不是取消长度校验，只是把下限调到"不能为空"这个
--   最小值）。最大长度维持数据库现状不变：title 上限本来就是 120（不是
--   200——120 是 20260715220300_create_posts_table.sql 里 posts_title_
--   length_check 的实际值，跟本次任务描述里提到的"标题最大 200"不一致，
--   这次只放宽下限，不动上限，所以按现状 120 保留，已单独向发起人报告
--   这处数据库实际值与任务描述的差异，不在这次迁移里顺带改动），
--   description 上限维持 10000（这个跟任务描述一致，未改动）。
--
-- 影响哪些表：
--   public.posts 上的 posts_title_length_check / posts_description_
--   length_check 两条 check 约束。
--
-- 是否影响现有数据：
--   不影响。约束只是变宽，不是变窄——现有数据本来就满足更严格的旧约束
--   （title >= 5、description >= 10），放宽下限后必然仍然满足新约束，
--   不需要任何数据回填/清洗。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- check 约束不能直接改，要先 drop 再重新 add（同 20260717000700_
-- account_status_enforcement.sql 改 moderation_actions_action_type_check
-- 时的做法）。

alter table public.posts
  drop constraint posts_title_length_check;

alter table public.posts
  add constraint posts_title_length_check
    check (char_length(title) between 1 and 120);

alter table public.posts
  drop constraint posts_description_length_check;

alter table public.posts
  add constraint posts_description_length_check
    check (char_length(description) between 1 and 10000);

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.posts drop constraint posts_title_length_check;
-- alter table public.posts add constraint posts_title_length_check
--   check (char_length(title) between 5 and 120);
--
-- alter table public.posts drop constraint posts_description_length_check;
-- alter table public.posts add constraint posts_description_length_check
--   check (char_length(description) between 10 and 10000);
