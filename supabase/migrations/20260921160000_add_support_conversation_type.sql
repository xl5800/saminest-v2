-- Migration: 新增 origin_type = 'support' 会话类型，把"联系客服"从系统
-- 通知会话里彻底拆出来
--
-- 为什么改：
--   现在"联系客服"和"系统通知"共用同一条 origin_type = 'system' 会话——
--   用户点"联系客服"进去，看到的是跟系统通知（比如"帖子审核通过"）混在
--   一起的一条会话，顶栏写"Saminest 通知"，不像一个专门的客服聊天窗口。
--   这次把两者拆成两种真正独立的会话类型：
--     - 'system'：只保留纯单向的自动通知，不再承载双向聊天（见下面
--       admin_reply_to_support_conversation 的改动——它现在只认
--       'support'，不再能对 'system' 会话回复）。
--     - 'support'：全新类型，专门给"联系客服"用，第一次创建时自动插入一
--       条客服欢迎语（跟 admin_reply_to_support_conversation() 插入的
--       客服聊天回复是同一种消息形状：sender_id = null、
--       notification_payload = null，前端天然套用现成的"官方客服"气泡
--       渲染，不需要新的渲染分支）。
--
--   历史数据不处理——已经跟 BARRY 确认过，生产库里已经存在的、混着系统
--   通知和用户测试消息的旧 system 会话保持原样不动，不做任何数据搬迁。
--   用户下次点"联系客服"会自动创建一条全新的 support 会话；旧的 system
--   会话继续存在，只是从此以后输入框会被前端隐藏（见前端改动），不会再
--   收到新的聊天消息，只会再收到新的自动通知。
--
--   admin_list_support_conversations() 这次改成只列出 'support' 类型，
--   同时**去掉**"存在一条 sender_id 不为空的消息"这个 exists 过滤——这条
--   过滤原本是为了排除"只收到过通知、从没主动联系过客服"的用户，但现在
--   support 会话只有在用户主动点"联系客服"（调用
--   get_or_create_own_support_conversation()）时才会被创建，会话存在
--   本身就已经是"用户主动联系过"的证据；而且新会话的第一条消息是欢迎语，
--   sender_id 也是 null，继续用旧的过滤条件反而会把"刚联系、还没自己
--   打字"的用户错误地排除在管理员列表之外。
--
-- 硬约束（不要重蹈上一次的覆辙）：
--   20260916120200_admin_support_conversations.sql 曾经给
--   conversations_select_member / messages_select_of_own_conversations 两
--   条 RLS 策略加过一个 is_admin() 例外，导致管理员账号能通过普通的"消息"
--   tab 看到别的用户的系统通知会话——这是一次真实的生产数据泄漏，已经在
--   20260921040500_remove_admin_exception_from_conversation_rls.sql 里改
--   回去了。这份迁移**不改动**这两条策略——管理员读取/回复 support 会话，
--   只走 admin_list_support_conversations() / admin_reply_to_support_
--   conversation() 这两个 security definer 函数（内部自己校验
--   is_admin()，天然绕过 RLS，不需要、也不应该在 RLS 策略层面给管理员
--   开任何例外）。
--
-- 影响哪些表/函数：
--   1. conversations_origin_type_check：加一个新取值 'support'。
--   2. 新增 get_or_create_own_support_conversation()——'联系客服'入口用，
--      跟 get_or_create_own_system_conversation() 是同一个模式（security
--      definer，目标用户固定是 auth.uid() 自己），但这次没有共享的查找/
--      创建 helper 可复用（get_or_create_system_conversation(uuid) 是
--      'system' 专用的，语义上不该被 'support' 复用/参数化——两者除了都是
--      "只有一个成员的会话"这一点表面相似之外，创建时要不要插入欢迎语这条
--      核心行为完全不同），这里独立实现一份，不强行抽象。
--   3. admin_list_support_conversations()：where 条件从 origin_type =
--      'system' 改成 'support'，去掉 exists 子查询过滤。
--   4. admin_reply_to_support_conversation()：只认 'support'，不再认
--      'system'，报错文案同步更新。
--   5. 不改 get_or_create_own_system_conversation() / get_or_create_
--      system_conversation() / notify_user()——它们继续原样服务纯通知
--      场景，逐字不动。
--
-- 是否影响现有数据：
--   不影响任何现有行——只放开 check 约束的取值范围、新增一个函数、改两个
--   现有函数的过滤条件，不删除/不修改任何历史会话或消息。旧的 system 会话
--   （包括历史上已经在里面双向聊天过的）继续存在，只是从这份迁移应用之后
--   起，admin_reply_to_support_conversation() 不能再对它们回复（管理员
--   如果误对一条 system 会话调用这个函数会收到异常，见下面的实现）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

-- =====================================================================
-- 1. conversations_origin_type_check：加 'support'
-- =====================================================================

alter table public.conversations
  drop constraint conversations_origin_type_check;

alter table public.conversations
  add constraint conversations_origin_type_check
    check (origin_type in ('post', 'activity', 'profile', 'system', 'support'));

-- =====================================================================
-- 2. 新增 get_or_create_own_support_conversation()
-- =====================================================================
--
-- 跟 get_or_create_own_system_conversation() 同一个模式：目标用户固定
-- 取 auth.uid()，不接受调用方指定任何用户 id。同样不做
-- is_account_restricted() 检查——账号受限/被封禁的用户尤其可能需要联系
-- 客服申诉，理由跟 get_or_create_own_system_conversation() 一致，见该
-- 函数迁移文件的说明。
--
-- 跟 get_or_create_system_conversation(uuid) 的关键区别：这里新建会话时
-- 会额外插入一条客服欢迎语消息（sender_id = null、
-- notification_payload = null——跟 admin_reply_to_support_conversation()
-- 插入的客服聊天回复是同一种消息形状，前端 conversation-page.tsx 现有的
-- isAdminReply 判断天然会把它渲染成"Headset 头像 + 官方客服标签 + 对方
-- 气泡"，不需要新写一个判断分支或者一个新的 notification_payload
-- kind）。找到已有 support 会话时直接返回，不会重复插入欢迎语——欢迎语
-- 只在"新建这条会话"这个分支里插入一次。
create or replace function public.get_or_create_own_support_conversation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'get_or_create_own_support_conversation requires an authenticated user';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.origin_type = 'support'
    and c.created_by = v_user_id
    and c.deleted_at is null
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type, post_id, created_by, origin_type)
    values ('direct', null, v_user_id, 'support')
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation_id, v_user_id)
    on conflict (conversation_id, user_id) do nothing;

    insert into public.messages (conversation_id, sender_id, body, notification_payload)
    values (
      v_conversation_id,
      null,
      '你好，欢迎联系 Saminest 客服，请详细描述你遇到的问题，方便的话可以附上截图，我们会尽快查看并回复~',
      null
    );
  end if;

  return v_conversation_id;
end;
$$;

revoke execute on function public.get_or_create_own_support_conversation() from public, anon;
grant execute on function public.get_or_create_own_support_conversation() to authenticated;

-- =====================================================================
-- 3. admin_list_support_conversations()：改成只列 'support'，去掉 exists 过滤
-- =====================================================================

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
    where c.origin_type = 'support'
      and c.deleted_at is null
    order by c.last_message_at desc nulls last;
end;
$$;

-- create or replace 不会重置已有的 GRANT/REVOKE（20260916120200 已经
-- revoke from public, anon / grant to authenticated 过），这里不需要
-- 重复这两行；保留是为了这份迁移单独拿出来看时权限状态依然显式可读，不
-- 依赖读者去翻上一份迁移确认。
revoke execute on function public.admin_list_support_conversations() from public, anon;
grant execute on function public.admin_list_support_conversations() to authenticated;

-- =====================================================================
-- 4. admin_reply_to_support_conversation()：只认 'support'
-- =====================================================================

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

  if v_origin_type <> 'support' then
    raise exception 'admin_reply_to_support_conversation only supports support conversations';
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

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会导致"联系客服"
-- 前端入口调用的函数不存在，需要同时回退前端改动才有意义）：
--
-- revoke execute on function public.get_or_create_own_support_conversation() from authenticated;
-- drop function if exists public.get_or_create_own_support_conversation();
--
-- （admin_list_support_conversations() / admin_reply_to_support_conversation()
--  回滚成 20260916120200_admin_support_conversations.sql 里的原始版本
--  （where 条件/校验换回 'system'，admin_list 换回加 exists 过滤）——
--  这里不重复贴一遍全文，直接 create or replace 回那份迁移里的定义即可）
--
-- alter table public.conversations drop constraint conversations_origin_type_check;
-- alter table public.conversations add constraint conversations_origin_type_check
--   check (origin_type in ('post', 'activity', 'profile', 'system'));
