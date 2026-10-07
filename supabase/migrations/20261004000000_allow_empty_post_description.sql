-- Migration: allow empty posts.description
--
-- 为什么改：
--   发布页简化改版（任务卡 7）：去掉独立的"标题"输入框，title 改成从
--   描述的第一行派生，描述框里用户可以只写一行（这一行就是标题），不再
--   强制必须有"标题之外的正文"。前端已经拦住"整个描述为空"的情况（派生
--   出来的 title 为空，提交前就被挡住），数据库侧这里只放开 description
--   自己的下限：允许空字符串，上限 10000 不变。
--
--   posts_title_length_check（1-120）这次不动——title 是从描述第一行派生、
--   前端截断到 120 之后写入的，仍然必须是非空的。
--
-- 影响哪些表：
--   public.posts 上的 posts_description_length_check 一条 check 约束。
--   description 列本身仍然是 NOT NULL，只是允许空字符串 ''。
--
-- 是否影响现有数据：
--   不影响。约束只是变宽，现有数据本来就满足更严格的旧约束
--   （1-10000），放宽下限后必然仍然满足，不需要回填/清洗。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--   注意回滚前要先确认库里没有 description 为空字符串的行，否则重新加回
--   旧约束会失败。
--
-- check 约束不能直接改，先 drop 再重新 add（同
-- 20260721000000_relax_posts_title_description_min_length.sql 的做法）。

alter table public.posts
  drop constraint posts_description_length_check;

alter table public.posts
  add constraint posts_description_length_check
    check (char_length(description) between 0 and 10000);

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.posts drop constraint posts_description_length_check;
-- alter table public.posts add constraint posts_description_length_check
--   check (char_length(description) between 1 and 10000);
