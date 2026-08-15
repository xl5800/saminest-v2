-- Migration: 补齐迁移文件缺口——加固 activity_participants 的 RLS 策略
--
-- 为什么改：
--   和上一份补齐迁移（20260815042354_create_go_together_activities_schema）
--   同样的缺口：这份 RLS 加固是在 2026-08-15 05:33:44（UTC）时直接在
--   Supabase Dashboard / MCP 上手工执行的，没有对应的本地迁移文件。这里
--   把当时实际执行过的 SQL 原样补进仓库，不改变线上任何东西（线上早就
--   是这个版本了）。
--
--   代码审查 activities-repository.ts 时发现两个真实可触达的漏洞：
--   1. 用户不能稳定 select 到自己的报名记录——之前只靠
--      activity_participants_select_joined 这条"当前有其他 active 记录"
--      的策略间接覆盖，cancelled_at 不为 null 时会查不到自己已取消的报名。
--   2. 重新报名（把 cancelled_at 从非空改回 null）之前没有重新校验活动
--      status = 'open'——只有全新 insert 会检查这一条，UPDATE 路径没有
--      检查，导致退出过的用户可以绕过满员/取消状态直接把自己加回去。
--      leave（把 cancelled_at 设为非空）不受影响，任何时候都允许退出。
--
-- 影响哪些表：
--   public.activity_participants：新增一条 select 策略
--   （activity_participants_select_own），重建 update 策略
--   （activity_participants_update_own，drop + create，WITH CHECK 新增
--   "重新报名需要活动仍是 open"的校验）；public.activities：撤销
--   authenticated/anon 对 participant_count 列的 UPDATE 权限（防止绕过
--   sync_activity_participant_count 触发器直接改这一列，该触发器见
--   20260815042354_create_go_together_activities_schema.sql）。
--
-- 是否影响现有数据：
--   不改任何已有行的值，只收紧权限/校验规则。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独
--   运行）。不建议回滚——回滚会恢复上面两个已确认的漏洞。
--
-- 说明：
--   以下 SQL 是当时在线上实际执行过的原始语句，原样落盘，未做任何改动。

create policy activity_participants_select_own on public.activity_participants
  for select
  using (user_id = auth.uid());

drop policy activity_participants_update_own on public.activity_participants;

create policy activity_participants_update_own on public.activity_participants
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      cancelled_at is not null
      or exists (
        select 1 from public.activities a
        where a.id = activity_participants.activity_id
          and a.deleted_at is null
          and a.status = 'open'
      )
    )
  );

-- 防止组织者绕过触发器直接改自己活动的 participant_count（这个字段只应该
-- 由 sync_activity_participant_count 这个 security definer 触发器写入）。
revoke update (participant_count) on public.activities from authenticated, anon;

-- 回滚方案（默认不执行，需要人工确认后单独运行——不建议回滚，会恢复
-- 上面两个已确认的漏洞）：
--
-- grant update (participant_count) on public.activities to authenticated, anon;
-- drop policy if exists activity_participants_update_own on public.activity_participants;
-- create policy activity_participants_update_own on public.activity_participants
--   for update
--   using (user_id = auth.uid())
--   with check (user_id = auth.uid());
-- drop policy if exists activity_participants_select_own on public.activity_participants;
