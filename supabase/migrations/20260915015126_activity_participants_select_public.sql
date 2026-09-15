-- Migration: 没有报名的用户看不到活动已有参与者——补一条公开可见的 RLS SELECT 策略
--
-- 为什么改：
--   BARRY 反馈"没有报名活动的用户看不到已经参加活动的参与者"，需要能看到，
--   这样才能吸引用户参与活动（社交证明——看到已经有人报名，更容易促使
--   犹豫的用户也报名）。
--
--   排查结论：activity_participants 表当前只有三条 SELECT 策略
--   （见 20260815053344_harden_activity_participants_rls.sql /
--   20260816195356_fix_activity_participants_select_joined_recursion.sql）：
--   - activity_participants_select_organizer：只有发起人能看到自己活动下
--     的所有报名记录。
--   - activity_participants_select_joined（is_fellow_activity_participant()
--     包装的版本）：只有自己已经是这个活动的有效参与者，才能看到同一个
--     活动下的其它参与者记录。
--   - activity_participants_select_own：只能看到自己的报名记录。
--
--   三条策略没有一条覆盖"还没报名、只是路过看看这个活动的用户"——这类
--   用户对这张表完全没有 SELECT 权限，RLS 在 listActivityParticipants()/
--   listActivityParticipantPreviews()（activities-repository.ts）这两个
--   查询函数够到数据库之前就把结果集清空了，这两个函数本身的过滤逻辑
--   （status = 'approved' and cancelled_at is null）是对的，问题完全在
--   数据库这一层，不是前端漏写。这不是设计上刻意的收紧——activities 表
--   已经有 activities_select_public 允许任何人看未删除/未取消的活动，
--   参与者列表理应跟随同一个公开可见性。
--
-- 具体怎么做：
--   新增一条 SELECT 策略，口径完全对齐 listActivityParticipants() 已经在
--   用的过滤条件，只放行"已批准且未取消"的参与者行，不暴露 pending（
--   审核中）/rejected（被拒绝）的申请记录给公开浏览的陌生人——发起人/
--   申请人各自能看到完整状态，是 select_organizer/select_own 两条已有
--   策略的职责，这条新策略不影响它们。同时要求对应活动满足
--   activities_select_public 同一个可见性条件（未删除、未取消）。
--
--   不需要包一层 security definer 辅助函数——这条策略查询的是另一张表
--   （activities），不是自引用查询，不会触发
--   20260816195356_fix_activity_participants_select_joined_recursion.sql
--   那种"策略查自己表"的递归问题，跟 activity_participants_insert_own
--   的 WITH CHECK 子句是同一种直接内联 EXISTS 子查询写法。
--
--   原有三条 SELECT 策略（organizer/joined/own）都不动——Postgres 多条
--   SELECT 策略是"或"的关系，新加一条只会让能看到的人更多，不会收紧
--   任何人现有的权限，这次也确实没有删除/修改任何一条已有策略。
--
-- 影响哪些表：
--   只新增一条 SELECT 策略，不新建表、不加列、不改任何已有策略。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行，只放宽了谁能读到哪些行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 部署：这次任务卡明确要求本地验证通过即可，不在这份迁移里自动部署到
-- 生产——本地 `supabase db reset` 验证结果见完工报告，生产库需要用户
-- 确认后单独 apply。

create policy activity_participants_select_public
  on public.activity_participants
  for select
  using (
    status = 'approved'
    and cancelled_at is null
    and exists (
      select 1
      from public.activities a
      where a.id = activity_participants.activity_id
        and a.deleted_at is null
        and a.status <> 'cancelled'
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists activity_participants_select_public on public.activity_participants;
