-- Migration: 联系客服改成真聊天——管理员读取/回复客服会话
--
-- 为什么改：
--   管理员不是任何一条 system 会话的 conversation_members 行（system
--   会话只插入了用户自己这一个成员，见 get_or_create_system_conversation()），
--   现有的 conversations_select_member / messages_select_of_own_conversations
--   两条 SELECT 策略都要求"当前用户是这条会话的成员"，管理员完全没有
--   路径能读到任何一条客服会话或它下面的消息。这次给这两条策略各加一个
--   "管理员 + 这条会话/这条消息所属会话是 system 类型"的例外分支——照抄
--   comments_select_of_approved_or_own_posts 加 is_admin() 例外的写法
--   （drop + 用同一个策略名重建，在原有条件后面加一个 or 分支，不是新增
--   一条平行的策略对象，见 20260824233346_comments_select_admin_exception.sql
--   的说明），刻意把管理员的例外限定在 origin_type = 'system' 这个范围
--   内——管理员不应该因为这次改动顺带获得读取任意用户之间私信（帖子/
--   活动/个人主页那三种来源）的权限，那是完全不同范围的越权。
--
--   管理员需要一个"列出所有真的有人发起过对话的客服会话"的入口
--   （admin_list_support_conversations()）和一个"以客服身份回复"的入口
--   （admin_reply_to_support_conversation()，因为管理员不是会话成员，
--   不能走 messages_insert_own_as_active_member 这条要求 sender_id =
--   auth.uid() 且是活跃成员的既有插入策略）——这两个都做成
--   security definer 函数，跟这个仓库其它管理员敏感操作（delete_comment/
--   admin_cancel_activity 等）是同一个模式：内部先校验 is_admin()，不是
--   直接开一条对 authenticated 角色宽松的 INSERT/SELECT 策略。
--
--   "真的有人发起过对话"这条业务规则（判断标准：这条会话下至少有一条
--   sender_id 不为空的消息）放进 admin_list_support_conversations() 函数
--   内部用 exists 子查询表达，不是让前端自己拼一个复杂的嵌套查询再在
--   客户端过滤——这条规则本身就是"客服列表该显示谁"的核心业务逻辑，放
--   数据库层一处实现，比前端过滤更不容易被绕过/漏改。
--
-- 影响哪些表/函数：
--   重建 conversations_select_member / messages_select_of_own_conversations
--   两条策略；新增 admin_list_support_conversations() /
--   admin_reply_to_support_conversation(uuid, text, text) 两个函数。
--
-- 是否影响现有数据：
--   不影响，只放宽管理员对 system 会话的只读范围 + 新增两个函数，不改
--   任何现有行、不影响普通用户原本能读到的范围。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

-- =====================================================================
-- conversations_select_member：加管理员读取 system 会话的例外
-- =====================================================================

drop policy if exists conversations_select_member on public.conversations;

create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (
    (deleted_at is null and is_conversation_member(id))
    or (deleted_at is null and origin_type = 'system' and public.is_admin())
  );

-- =====================================================================
-- messages_select_of_own_conversations：同样的例外
-- =====================================================================

drop policy if exists messages_select_of_own_conversations on public.messages;

create policy messages_select_of_own_conversations
  on public.messages
  for select
  to authenticated
  using (
    is_conversation_member(conversation_id)
    or (
      public.is_admin()
      and exists (
        select 1
        from public.conversations c
        where c.id = messages.conversation_id
          and c.origin_type = 'system'
          and c.deleted_at is null
      )
    )
  );

-- =====================================================================
-- admin_list_support_conversations()：客服会话列表
-- =====================================================================
--
-- 只返回"真的有人发起过对话"的 system 会话——只收到过审核通知、从来没有
-- 主动联系过客服的用户不应该出现在这个列表里，判断标准是这条会话下存在
-- 至少一条 sender_id 不为空的消息（意味着用户自己发过东西；系统通知/
-- 管理员回复的 sender_id 都是 null，不满足这个条件）。按最后一条消息
-- 时间倒序排（不做已读状态，见任务范围说明）。
create or replace function public.admin_list_support_conversations()
returns table (
  conversation_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  last_message_at timestamptz,
  last_message_preview text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can list support conversations';
  end if;

  return query
    select
      c.id as conversation_id,
      c.created_by as user_id,
      p.display_name,
      p.avatar_url,
      c.last_message_at,
      c.last_message_preview
    from public.conversations c
    join public.profiles p on p.id = c.created_by
    where c.origin_type = 'system'
      and c.deleted_at is null
      and exists (
        select 1
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id is not null
          and m.deleted_at is null
      )
    order by c.last_message_at desc nulls last;
end;
$$;

revoke execute on function public.admin_list_support_conversations() from public, anon;
grant execute on function public.admin_list_support_conversations() to authenticated;

-- =====================================================================
-- admin_reply_to_support_conversation()：管理员以客服身份回复
-- =====================================================================
--
-- 插入的消息 sender_id = null、notification_payload = null——这是这次
-- messages_sender_or_notification_check 新放开的第三种合法组合（客服聊天
-- 回复：不是任何真实用户发的，但也不是结构化通知卡片，是一条普通聊天
-- 气泡，只是发送者是"官方客服"），见 add_message_images_and_bucket.sql
-- 之前那份约束定义，这里不重复贴。
--
-- 这是管理员回复用户唯一合法的入口，不能直接对 messages 表 insert——
-- messages_insert_own_as_active_member 这条策略要求 sender_id =
-- auth.uid() 且是活跃成员，管理员两条都不满足；也不应该单独为
-- sender_id is null 的场景开一条对 authenticated 角色宽松的 INSERT
-- 策略（那样任何登录用户都能伪造一条"官方客服回复"），必须像
-- delete_comment/admin_cancel_activity 这些管理员敏感操作一样，走
-- security definer 函数内部校验 is_admin()。
create or replace function public.admin_reply_to_support_conversation(
  target_conversation_id uuid,
  body text,
  image_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin_type text;
begin
  if not public.is_admin() then
    raise exception 'only admins can reply to support conversations';
  end if;

  select origin_type into v_origin_type
  from public.conversations
  where id = target_conversation_id
    and deleted_at is null;

  if v_origin_type is null then
    raise exception 'conversation % not found', target_conversation_id;
  end if;

  if v_origin_type <> 'system' then
    raise exception 'admin_reply_to_support_conversation only supports system conversations';
  end if;

  if body is null and image_path is null then
    raise exception 'admin_reply_to_support_conversation requires a body or an image';
  end if;

  insert into public.messages (conversation_id, sender_id, body, image_path, notification_payload)
  values (target_conversation_id, null, body, image_path, null);
end;
$$;

revoke execute on function public.admin_reply_to_support_conversation(uuid, text, text) from public, anon;
grant execute on function public.admin_reply_to_support_conversation(uuid, text, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.admin_reply_to_support_conversation(uuid, text, text) from authenticated;
-- drop function if exists public.admin_reply_to_support_conversation(uuid, text, text);
--
-- revoke execute on function public.admin_list_support_conversations() from authenticated;
-- drop function if exists public.admin_list_support_conversations();
--
-- drop policy if exists messages_select_of_own_conversations on public.messages;
-- create policy messages_select_of_own_conversations
--   on public.messages
--   for select
--   to authenticated
--   using (is_conversation_member(conversation_id));
--
-- drop policy if exists conversations_select_member on public.conversations;
-- create policy conversations_select_member
--   on public.conversations
--   for select
--   to authenticated
--   using (deleted_at is null and is_conversation_member(id));
