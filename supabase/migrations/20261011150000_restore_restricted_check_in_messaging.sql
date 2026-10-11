-- Migration: 私信补回"账号受限不能发"的检查 + "联系卖家"补受限检查和每日上限
--
-- 为什么改：
--   1. messages_insert_own_as_active_member 这条 INSERT 策略在
--      20260717000700_account_status_enforcement.sql 里加过
--      `not public.is_account_restricted()`，但
--      20260824233319_enforce_user_blocks_in_messaging.sql 加屏蔽检查时
--      drop 掉重建，重建的版本漏了这个条件——线上现在被限制/封禁
--      （account_status in ('restricted','suspended')）的账号仍然可以在
--      已有会话里继续发私信。这里把它补回来。
--      例外：客服会话（origin_type = 'support'）不受这条限制——账号被限制
--      的用户需要能联系客服申诉；20260717 那一版限制规则写的时候客服会话
--      还不存在（20260916 才加），所以这是新补的例外，不是放宽原规则。
--   2. create_direct_conversation(target_post_id)（帖子页"联系卖家"）
--      从来没有检查账号是否受限，也没有每日新建会话上限；另外两个入口
--      （create_profile_conversation 有受限检查 + 每日 8 个上限，
--      create_activity_conversation 有受限检查）都有。被封的账号可以通过
--      帖子页私信每一个发帖人。这里补上：
--        - 受限账号直接拒绝（报错文案跟另外两个入口逐字一致，前端
--          conversations-repository.ts 已经按这段文字识别、换成中文提示）；
--        - 只在"真的要新建会话"时计数（已经有会话的直接返回，不占额度），
--          按 created_by = 自己、origin_type = 'post'、今天（UTC 日界，
--          跟 create_profile_conversation 同一个口径）新建的会话数计算，
--          上限 20——比个人主页入口的 8 宽松，因为"联系卖家/房东"是租房
--          二手的主流程，正常买家一天联系十几个帖子是合理的；报错文案跟
--          create_profile_conversation 逐字一致（'daily new conversation
--          limit reached'），前端可以复用同一段识别逻辑。
--
-- 影响哪些表/函数：
--   不新建表。新增一个 security definer 辅助函数
--   is_support_conversation(uuid)；重建 create_direct_conversation(uuid)
--   （create or replace，签名不变）；重建 messages 表的
--   messages_insert_own_as_active_member 策略。
--
-- 是否影响现有数据：
--   不修改任何现有行。线上目前没有 account_status <> 'active' 的账号，
--   生效后不会有任何现有用户突然不能发消息。
--
-- 是否需要回滚方案：
--   需要，见文件末尾注释（默认不执行）。

-- ---------------------------------------------------------------------
-- 1. is_support_conversation：策略里判断"这是不是客服会话"
-- ---------------------------------------------------------------------
-- 用 security definer 函数而不是在策略里直接 exists (select ... from
-- conversations)：跟 is_active_conversation_member / is_blocked_in_conversation
-- 同一个理由，避免策略里的子查询再触发 conversations 表自己的 RLS，
-- 也避免以后 conversations 的策略改动意外影响这里的判断。
create or replace function public.is_support_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and c.origin_type = 'support'
  );
$$;

revoke execute on function public.is_support_conversation(uuid) from public, anon;
grant execute on function public.is_support_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. messages_insert_own_as_active_member：补回受限检查（客服会话除外）
-- ---------------------------------------------------------------------
drop policy if exists messages_insert_own_as_active_member on public.messages;

create policy messages_insert_own_as_active_member
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_conversation_member(messages.conversation_id)
    and not public.is_blocked_in_conversation(messages.conversation_id, auth.uid())
    and (
      not public.is_account_restricted()
      or public.is_support_conversation(messages.conversation_id)
    )
  );

-- ---------------------------------------------------------------------
-- 3. create_direct_conversation：补受限检查 + 每日新建上限
-- ---------------------------------------------------------------------
-- 结构照抄 create_profile_conversation：受限检查 → 目标校验 → 屏蔽检查 →
-- 已有会话直接返回 → 计数 → 新建。屏蔽检查和"找已有会话"原来都在
-- get_or_create_direct_conversation() 里一步完成，这里需要在"找到已有会话"
-- 和"新建"之间插入计数，所以拆开直接调用 find_direct_conversation_between /
-- create_direct_conversation_row（create_profile_conversation 已经是这么做的），
-- get_or_create_direct_conversation 本身不改，活动入口和活动群发通知继续用它。
create or replace function public.create_direct_conversation(target_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_seller_id uuid;
  v_conversation_id uuid;
  v_today_new_conversation_count int;
  c_daily_limit constant int := 20;
begin
  if v_buyer_id is null then
    raise exception 'create_direct_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select author_id into v_seller_id
  from public.posts
  where id = target_post_id
    and deleted_at is null;

  if v_seller_id is null then
    raise exception 'post % not found', target_post_id;
  end if;

  if v_seller_id = v_buyer_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  if public.is_blocked_with(v_seller_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  v_conversation_id := public.find_direct_conversation_between(v_buyer_id, v_seller_id);

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select count(*) into v_today_new_conversation_count
  from public.conversations c
  where c.created_by = v_buyer_id
    and c.origin_type = 'post'
    and c.created_at >= date_trunc('day', now());

  if v_today_new_conversation_count >= c_daily_limit then
    raise exception 'daily new conversation limit reached';
  end if;

  v_conversation_id := public.create_direct_conversation_row(v_buyer_id, v_seller_id, 'post');

  return v_conversation_id;
end;
$$;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会恢复"受限账号
-- 仍能发私信/联系卖家"这个已知问题，不建议真的执行）：
--
-- drop policy if exists messages_insert_own_as_active_member on public.messages;
-- create policy messages_insert_own_as_active_member
--   on public.messages
--   for insert
--   to authenticated
--   with check (
--     sender_id = auth.uid()
--     and public.is_active_conversation_member(messages.conversation_id)
--     and not public.is_blocked_in_conversation(messages.conversation_id, auth.uid())
--   );
--
-- create or replace function public.create_direct_conversation(target_post_id uuid)
-- returns uuid language plpgsql security definer set search_path = public as $$
-- declare
--   v_buyer_id uuid := auth.uid();
--   v_seller_id uuid;
--   v_conversation_id uuid;
-- begin
--   if v_buyer_id is null then
--     raise exception 'create_direct_conversation requires an authenticated user';
--   end if;
--   select author_id into v_seller_id from public.posts
--   where id = target_post_id and deleted_at is null;
--   if v_seller_id is null then
--     raise exception 'post % not found', target_post_id;
--   end if;
--   if v_seller_id = v_buyer_id then
--     raise exception 'cannot start a direct conversation with yourself';
--   end if;
--   v_conversation_id := public.get_or_create_direct_conversation(v_buyer_id, v_seller_id, 'post');
--   return v_conversation_id;
-- end;
-- $$;
--
-- drop function if exists public.is_support_conversation(uuid);
