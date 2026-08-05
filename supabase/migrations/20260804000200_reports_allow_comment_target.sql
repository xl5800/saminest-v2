-- Migration: reports 表支持举报评论
--
-- 为什么改：
--   评论功能新增"举报评论"入口，reports 表当初设计时 target_type 只允许
--   'post'，但迁移文件里明确写了"未来如果要支持 profile/message 等需要
--   新增一份迁移放宽这个约束，不在这里提前加进去"（见
--   create_reports_table 迁移），现在就是这个"未来"，按计划补一份新迁移
--   放宽约束，不改动原迁移文件本身。
--
-- 影响哪些表：
--   只改 public.reports 的 reports_target_type_check 约束，其余列/索引/
--   RLS 策略都不需要变——reports_reporter_active_target_unique_idx 部分
--   唯一索引、reports_select_own/reports_insert_own 两条策略本来就是按
--   (target_type, target_id) 这种通用组合设计的，comment 直接复用，不用
--   改。
--
-- 是否影响现有数据：
--   不影响，现有 reports 行的 target_type 全部是 'post'，仍然满足新约束。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.reports
  drop constraint reports_target_type_check;

alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'comment'));

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.reports drop constraint if exists reports_target_type_check;
-- alter table public.reports add constraint reports_target_type_check check (target_type in ('post'));
-- （回滚前必须确认 reports 表里没有 target_type = 'comment' 的行，否则加不回旧约束）
