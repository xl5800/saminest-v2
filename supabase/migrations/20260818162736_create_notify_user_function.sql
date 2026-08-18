-- Migration: notify_user() — 系统通知内部函数
--
-- 为什么改：
--   给"系统通知"提供一个统一的写入入口：拿到/建出目标用户专属的
--   origin_type = 'system' 会话（只有接收者一个成员，见上一份迁移的
--   说明），往里插一条 sender_id = null、带结构化 notification_payload
--   的消息。这个函数本身不判断"能不能通知"，也不知道具体业务场景（帖子
--   审核通过/账号状态变更等）——那些判断留在各自的业务函数（approve_post/
--   reject_post，以后可能还有 set_account_status 等）里，它们各自确认
--   完自己的业务权限之后再调用这个函数发通知，职责分开。
--
-- 影响哪些表：
--   不新建表、不加列。只新增一个函数 notify_user(uuid, text, text, text)。
--   函数体内会 insert 到 public.conversations / public.conversation_members /
--   public.messages 三张已有表。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 权限设计（重点）：
--   这个函数故意不 grant execute 给 authenticated/anon 任何角色——它只应该
--   被其它 security definer 函数在内部调用（比如 approve_post/reject_post），
--   不应该被前端直接 .rpc() 调用（不然任何登录用户都能伪造一条"系统通知"
--   发给任意用户，包括自己伪造一条"审核通过"哄骗自己）。这样设计是安全的：
--   PostgreSQL 里 security definer 函数体内的执行上下文是函数属主
--   （这个项目里所有函数都是同一个属主创建的，跟 is_admin()/
--   is_account_restricted() 这些内部 helper 被其它函数自由调用、从来不需要
--   单独 grant 是同一个原理），属主对自己创建的所有对象天然有执行权限，
--   不需要额外 grant；但 PostgREST 面向 HTTP 的 RPC 路由会检查
--   anon/authenticated 角色的 grant，没有 grant 就会在这一层直接拒绝，
--   这就是这里要的效果——只堵住"客户端直接调用"这一条路，不影响"内部
--   函数互相调用"这条路。

create or replace function public.notify_user(
  target_user_id uuid,
  title text,
  summary text,
  link text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if target_user_id is null then
    raise exception 'notify_user requires a target_user_id';
  end if;

  if title is null or trim(both from title) = '' then
    raise exception 'notify_user requires a non-empty title';
  end if;

  -- 系统通知会话只有接收者一个成员，用 created_by = target_user_id 直接
  -- 定位，不需要像 create_profile_conversation 那样联表判断"两个人是不是
  -- 都是成员"。
  select c.id into v_conversation_id
  from public.conversations c
  where c.origin_type = 'system'
    and c.created_by = target_user_id
    and c.deleted_at is null
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type, post_id, created_by, origin_type)
    values ('direct', null, target_user_id, 'system')
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation_id, target_user_id)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  -- body 存 summary（没给 summary 就退回 title）纯文本兜底，兼容任何
  -- 还在直接读 messages.body 展示的既有代码路径；notification_payload
  -- 才是前端渲染卡片真正要用的结构化内容。
  insert into public.messages (conversation_id, sender_id, body, notification_payload)
  values (
    v_conversation_id,
    null,
    coalesce(summary, title),
    jsonb_build_object('title', title, 'summary', summary, 'link', link)
  );

  return v_conversation_id;
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text) from public;
revoke execute on function public.notify_user(uuid, text, text, text) from authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop function if exists public.notify_user(uuid, text, text, text);
