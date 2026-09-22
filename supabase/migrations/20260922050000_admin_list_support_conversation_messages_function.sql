-- Migration: 新增 admin_list_support_conversation_messages()，修复管理员
-- 客服会话详情页读不到消息内容的缺口
--
-- 为什么改：
--   管理员后台的客服会话详情页（/admin/support/:conversationId，
--   support-conversation-page.tsx）读消息列表用的是 useMessagesQuery() ->
--   listMessages()（messages-repository.ts）——这是一个普通的、受 RLS 保护
--   的查询，越权保护完全交给 messages 表自己的
--   messages_select_of_own_conversations 这条 SELECT 策略：只允许"当前
--   用户是这条会话的成员"。管理员从来不是任何一条客服会话的
--   conversation_members 行，这条策略对管理员必然不成立，结果是管理员
--   打开一个全新的客服会话详情页，listMessages() 拿到的是 RLS 静默过滤
--   后的 0 行（不报错，只是查不到任何消息）。
--
--   这条策略曾经短暂加过一个"管理员 + 会话是 system 类型"的例外
--   （20260916120200_admin_support_conversations.sql），但那次改动导致
--   管理员账号能通过普通的"消息"tab 看到别的用户的系统通知会话——一次
--   真实的生产数据泄漏，已经在
--   20260921040500_remove_admin_exception_from_conversation_rls.sql 里
--   改回去了，并且明确定下规矩：这条策略以后不能再开任何管理员例外。
--
--   会话列表页（admin_list_support_conversations()）和发送回复
--   （admin_reply_to_support_conversation()）都是 security definer 函数，
--   内部自己校验 is_admin()，天然绕过 RLS，不受这个缺口影响——唯独"读
--   消息内容"这一步还在用受 RLS 限制的常规查询，是当前唯一没有走
--   security definer 安全路径的一环。这份迁移补上这最后一环，跟
--   admin_reply_to_support_conversation() 同一个思路：新增一个 security
--   definer 函数，内部自己校验调用者是管理员、目标会话确实是 support
--   类型，然后返回消息列表，天然绕过 RLS。
--
-- 硬约束（不要重蹈上一次的覆辙，这条这次也适用）：
--   这份迁移**不改动** conversations_select_member /
--   messages_select_of_own_conversations 这两条 RLS 策略，不给它们加任何
--   例外。管理员读消息内容完全通过这个新的 security definer 函数，不碰
--   RLS 层。
--
-- 影响哪些表/函数：
--   新增 admin_list_support_conversation_messages(target_conversation_id
--   uuid)——只读函数，不修改任何数据。校验顺序跟
--   admin_reply_to_support_conversation() 一致：先查 public.is_admin()，
--   不是管理员就报错；再查目标会话是否存在、origin_type 是否等于
--   'support'（不存在或不是 support 类型都报错，不对 system/direct/
--   post/activity/profile 这些其它类型会话开口子——管理员没有理由通过
--   这个函数读到跟客服无关的会话内容）。校验通过后返回这条会话未软删除
--   的消息，字段和排序跟 listMessages()（messages-repository.ts）现在查
--   的完全一致：id, sender_id, body, notification_payload, image_path,
--   ref_activity_id, created_at，按 created_at 升序。
--
-- 是否影响现有数据：
--   不影响——只新增一个只读函数，不修改任何表结构、不修改任何行、不改动
--   任何已有的 RLS 策略。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create or replace function public.admin_list_support_conversation_messages(
  target_conversation_id uuid
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  notification_payload jsonb,
  image_path text,
  ref_activity_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_origin_type text;
begin
  if not public.is_admin() then
    raise exception 'only admins can read support conversation messages';
  end if;

  -- 这里必须显式加表别名限定 id/deleted_at——这个函数的返回类型
  -- （returns table）声明了一个同样叫 id 的输出列，在函数体里跟不带
  -- 前缀的 conversations.id 同名，plpgsql 会认为它有歧义（"column
  -- reference \"id\" is ambiguous"）并直接报错。
  -- admin_reply_to_support_conversation() 没有这个问题是因为它
  -- 返回 void，函数作用域里不存在一个叫 id 的输出列跟它抢名字，这里
  -- 不能照抄那份实现的写法。
  select c.origin_type into v_origin_type
  from public.conversations c
  where c.id = target_conversation_id
    and c.deleted_at is null;

  if v_origin_type is null then
    raise exception 'conversation % not found', target_conversation_id;
  end if;

  if v_origin_type <> 'support' then
    raise exception 'admin_list_support_conversation_messages only supports support conversations';
  end if;

  return query
    select
      m.id,
      m.sender_id,
      m.body,
      m.notification_payload,
      m.image_path,
      m.ref_activity_id,
      m.created_at
    from public.messages m
    where m.conversation_id = target_conversation_id
      and m.deleted_at is null
    order by m.created_at asc;
end;
$$;

revoke execute on function public.admin_list_support_conversation_messages(uuid) from public, anon;
grant execute on function public.admin_list_support_conversation_messages(uuid) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会导致管理员客服
-- 会话详情页重新读不到任何消息，需要同时回退前端改动才有意义）：
--
-- revoke execute on function public.admin_list_support_conversation_messages(uuid) from authenticated;
-- drop function if exists public.admin_list_support_conversation_messages(uuid);
