-- Migration: reports 表支持举报用户本人
--
-- 为什么改：
--   UGC 安全功能补齐任务卡 2——登录用户需要能在任意用户主页举报这个用户
--   本人（不是举报这个用户发的某条帖子/活动，是举报账号本身，比如骚扰、
--   冒充、发布违规头像/简介等只能归因到"这个人"而不是某一条具体内容的
--   情况），跟现有"举报帖子/举报活动/举报评论"是同一套 reports 表机制，
--   只是 target_type 换成 'user'、target_id 存 profiles.id。
--
--   跟 20260804000200_reports_allow_comment_target.sql /
--   20260816171649_allow_activity_reports.sql 是完全同一个模式：只放宽
--   target_type 的枚举值，不新增表、不新增函数——reports_insert_own /
--   reports_select_own_or_admin 这两条 RLS 策略、
--   reports_reporter_active_target_unique_idx 这条部分唯一索引本来就是
--   完全泛化的，不关心 target_type 具体是什么值，加一个 'user' 选项不需要
--   动它们。"不能举报自己"这条产品要求不在数据库层强制（跟其它
--   target_type 一样，reports 表设计上从来没有限制"不能举报自己发的
--   帖子/活动"），前端在 src/pages/report/report-user-page.tsx 里做
--   防御性判断，不在这份迁移里加一条只针对 target_type = 'user' 的特例
--   check 约束——那样会让这张表的约束逻辑因为一个前端就能做的判断变得
--   更复杂，不值得。
--
-- 影响哪些表：
--   只改 public.reports 的 reports_target_type_check 约束，其余列/索引/
--   RLS 策略都不需要变。
--
-- 是否影响现有数据：
--   不影响，现有 reports 行的 target_type 只会是
--   'post'/'comment'/'activity'，仍然满足新约束。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['post', 'comment', 'activity', 'user']));

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.reports drop constraint if exists reports_target_type_check;
-- alter table public.reports add constraint reports_target_type_check
--   check (target_type = any (array['post', 'comment', 'activity']));
-- （回滚前必须确认 reports 表里没有 target_type = 'user' 的行，否则加不回旧约束）
