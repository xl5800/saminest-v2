-- Migration: fix infinite recursion in conversation_members RLS
--
-- 为什么改：
--   supabase/migrations/20260716000400_create_messaging_tables.sql 里的
--   conversation_members_select_of_own_conversations 策略用了一个自连接
--   EXISTS 子查询（在 conversation_members 自己的 RLS 策略里，又去查
--   conversation_members 本身）来实现"我能看到我参与的会话里的所有成员"。
--   这个策略已经被推送并在真实浏览器验证时触发：Postgres 报
--   42P17 infinite recursion detected in policy for relation
--   "conversation_members"——因为子查询本身也要经过这条策略求值，
--   这条策略的求值又需要跑一次子查询，无限循环下去，Postgres 检测到
--   之后直接报错，不是环境或数据问题，是策略设计本身的 bug。
--
--   之前迁移的注释里错误地认为"这是常见的自连接 EXISTS 写法，不是真正的
--   递归"，这个判断是错的：只要一条策略的子查询目标是它自己所在的表，
--   Postgres 就会对子查询里的那次读取重新套用同一条策略，这才是真正的
--   递归，而不是"表面像递归但其实安全"。
--
-- 影响哪些表：
--   不新建表，只新增两个 security definer 辅助函数，并重建
--   conversations / conversation_members / messages 上一共 4 条依赖
--   "我是不是这个会话的成员"这个判断的策略，让它们统一改用这两个函数，
--   而不是各自内联子查询——这样无论以后谁在哪张表的策略里需要做这个判断，
--   读取 conversation_members 的动作都经过 security definer 函数、
--   绕过 RLS，不会再触发这个递归。
--
--   已建好的 20260716000400 迁移文件本身不修改（它已经被推送生效，
--   历史迁移不应该被事后改写），这份新迁移是在它之上做修正。
--
-- 是否影响现有数据：
--   不影响任何数据，只改函数和策略定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--   注意：回滚会恢复到有递归 bug 的状态，回滚之后 conversation_members
--   的 SELECT 会重新报 42P17，不建议真的执行，只是按惯例保留。

-- 判断当前用户是否是某个会话的成员（不管是否已经 left_at，只要有这一行
-- 记录）。security definer + 属主拥有 conversation_members 表，函数内部
-- 的查询天然绕过 conversation_members 自身的 RLS，不会重新触发依赖它的
-- 那条 SELECT 策略——这正是用来打破递归的关键。
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

-- 判断当前用户是否是某个会话的"当前有效"成员（left_at is null）。
-- 15.6 节"发送者必须是该会话有效成员"用的是这个更严格的版本，跟单纯的
-- "曾经是成员就能读历史消息"（is_conversation_member）分开，语义和
-- 20260716000400 迁移里原本内联写的判断保持一致，只是换成 security
-- definer 函数来源，原理同上。
create or replace function public.is_active_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = auth.uid()
      and cm.left_at is null
  );
$$;

-- conversation_members：重建 SELECT 策略（这是真正触发递归的那一条）
drop policy if exists conversation_members_select_of_own_conversations on public.conversation_members;

create policy conversation_members_select_of_own_conversations
  on public.conversation_members
  for select
  to authenticated
  using (
    public.is_conversation_member(conversation_members.conversation_id)
  );

-- conversations：SELECT 策略原本内联查 conversation_members，理论上在
-- 上面那条策略修好之后就不会再递归（只会触发一次、非递归的策略求值），
-- 但统一换成 security definer 函数，避免以后又有人改动 conversation_members
-- 的策略时不小心引入新的递归。
drop policy if exists conversations_select_member on public.conversations;

create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (
    deleted_at is null
    and public.is_conversation_member(conversations.id)
  );

-- messages：SELECT / INSERT 策略同样统一换成 security definer 函数，
-- 原因同上。INSERT 那条的"必须是当前有效成员"用
-- is_active_conversation_member，跟原来内联写的 left_at is null 语义
-- 完全一致，只是换了实现方式。
drop policy if exists messages_select_of_own_conversations on public.messages;

create policy messages_select_of_own_conversations
  on public.messages
  for select
  to authenticated
  using (
    public.is_conversation_member(messages.conversation_id)
  );

drop policy if exists messages_insert_own_as_active_member on public.messages;

create policy messages_insert_own_as_active_member
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_conversation_member(messages.conversation_id)
  );

-- 回滚方案（默认不执行，会重新引入递归 bug，只按惯例保留，不建议真的跑）：
--
-- drop policy if exists messages_insert_own_as_active_member on public.messages;
-- create policy messages_insert_own_as_active_member
--   on public.messages
--   for insert
--   to authenticated
--   with check (
--     sender_id = auth.uid()
--     and exists (
--       select 1 from public.conversation_members cm
--       where cm.conversation_id = messages.conversation_id
--         and cm.user_id = auth.uid()
--         and cm.left_at is null
--     )
--   );
--
-- drop policy if exists messages_select_of_own_conversations on public.messages;
-- create policy messages_select_of_own_conversations
--   on public.messages
--   for select
--   to authenticated
--   using (
--     exists (
--       select 1 from public.conversation_members cm
--       where cm.conversation_id = messages.conversation_id
--         and cm.user_id = auth.uid()
--     )
--   );
--
-- drop policy if exists conversations_select_member on public.conversations;
-- create policy conversations_select_member
--   on public.conversations
--   for select
--   to authenticated
--   using (
--     deleted_at is null
--     and exists (
--       select 1 from public.conversation_members cm
--       where cm.conversation_id = conversations.id
--         and cm.user_id = auth.uid()
--     )
--   );
--
-- drop policy if exists conversation_members_select_of_own_conversations on public.conversation_members;
-- create policy conversation_members_select_of_own_conversations
--   on public.conversation_members
--   for select
--   to authenticated
--   using (
--     exists (
--       select 1 from public.conversation_members self_membership
--       where self_membership.conversation_id = conversation_members.conversation_id
--         and self_membership.user_id = auth.uid()
--     )
--   );
--
-- drop function if exists public.is_active_conversation_member(uuid);
-- drop function if exists public.is_conversation_member(uuid);
