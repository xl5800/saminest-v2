-- Migration: 联系客服改成真聊天——抽出共享的
-- get_or_create_system_conversation()，新增用户可直接调用的
-- get_or_create_own_system_conversation()
--
-- 为什么改：
--   "联系客服"这次要从"填一次性表单"改成"打开/新建自己的 system 会话，
--   直接进聊天界面"。notify_user() 内部已经有一段"按
--   created_by = target_user_id 查有没有已存在的 system 会话，没有就建
--   一条、只插入这一个成员"的逻辑（见该函数迁移文件），这次新增的
--   get_or_create_own_system_conversation() 需要一模一样的查找/创建
--   逻辑，只是目标用户从"调用方指定的 target_user_id"变成"auth.uid() 自己"
--   ——按用户要求，抽成一个两边共用的内部函数，不重复写一份几乎相同的
--   SQL（这个仓库对"对话去重"那批 find_direct_conversation_between() 等
--   四个共享函数是同一个做法，见
--   20260825044820_unify_direct_conversation_lookup_and_reference_messages.sql）。
--
-- 影响哪些函数：
--   新增 public.get_or_create_system_conversation(uuid)——纯内部辅助，
--   不是新的公开 RPC 面，权限收紧方式跟"对话去重"那四个共享函数完全一样
--   （revoke from public, anon, authenticated 一次性收紧，不能被客户端
--   直接 .rpc() 调用，只能被同文件/其它函数内部调用）。
--
--   重建 public.notify_user(uuid, text, text, text)：函数体内原来内联的
--   "查找/创建 system 会话"那几行改成调用上面的共享函数，其余逻辑（参数
--   校验、body/notification_payload 怎么写）逐字不变。CREATE OR REPLACE
--   FUNCTION 不会重置已有的 GRANT/REVOKE 设置（这个函数当前的执行权限
--   状态是"已经从 public/anon/authenticated 全部收回"，见
--   create_notify_user_function.sql +
--   fix_notify_user_anon_execute_leak.sql 两份迁移），这次不重复写一遍
--   revoke 语句。
--
--   新增 public.get_or_create_own_system_conversation()——这次任务卡真正
--   要新增的、给前端"联系客服"入口直接调用的公开函数：目标用户固定是
--   auth.uid() 自己，不接受、也不需要任何参数（跟 notify_user 能给任意
--   target_user_id 发通知是完全不同的信任级别，所以这次特意拆成两个
--   函数，不是给 get_or_create_system_conversation 加一个"哪个身份能传
--   target_user_id、哪个身份只能传自己"的权限分叉）。
--
-- 是否影响现有数据：
--   不影响，只重组函数内部实现、新增一个函数，不改任何现有行、不改
--   notify_user() 的外部行为（同样的调用方式、同样的返回值语义）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

-- =====================================================================
-- 共享内部函数：按 target_user_id 查找/创建它专属的 system 会话
-- =====================================================================
--
-- 逐字抄自 notify_user() 原来内联的那一段（见
-- create_notify_user_function.sql），只是把 target_user_id 从函数体内的
-- 局部使用对象改成显式参数。system 会话只有目标用户自己一个成员，用
-- created_by = target_user_id 直接定位，不需要联表判断"两个人是不是都是
-- 成员"（这是 create_profile_conversation 那种双人会话才需要的判断）。
create or replace function public.get_or_create_system_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
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

  return v_conversation_id;
end;
$$;

-- 内部专用，不是公开 RPC 面——理由跟"对话去重"那四个共享函数完全一样，
-- 见 lock_down_internal_conversation_helper_functions.sql 的说明：只
-- revoke from public 不够，这个 Supabase 项目会默认单独把新建函数的
-- execute 权限授予 anon/authenticated，必须显式对这两个角色也 revoke。
revoke execute on function public.get_or_create_system_conversation(uuid) from public, anon, authenticated;

-- =====================================================================
-- 重建 notify_user()：内部改调用上面的共享函数
-- =====================================================================

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

  v_conversation_id := public.get_or_create_system_conversation(target_user_id);

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

-- =====================================================================
-- 新增：get_or_create_own_system_conversation()——"联系客服"入口用
-- =====================================================================
--
-- 目标用户固定取 auth.uid()，不接受调用方指定任何用户 id——这是这个函数
-- 能安全开放给所有登录用户直接调用的前提（跟 create_direct_conversation
-- 等三个会话创建入口"买家/操作者身份固定从 auth.uid() 取，不接受调用方
-- 传参"是同一个原则）。
--
-- 这里没有加 is_account_restricted() 检查——账号受限/被封禁的用户尤其
-- 可能需要联系客服申诉，不应该因为受限状态反而联系不上客服，这跟
-- create_direct_conversation 等三个"联系其它真实用户"的入口会拦截受限
-- 账号是不同的场景（那三个是防骚扰/防滥用，这个是"用户找官方"，两者的
-- 风险模型不一样）。
create or replace function public.get_or_create_own_system_conversation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'get_or_create_own_system_conversation requires an authenticated user';
  end if;

  return public.get_or_create_system_conversation(v_user_id);
end;
$$;

revoke execute on function public.get_or_create_own_system_conversation() from public, anon;
grant execute on function public.get_or_create_own_system_conversation() to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会导致"联系客服"
-- 前端入口调用的函数不存在，需要同时回退前端改动才有意义）：
--
-- revoke execute on function public.get_or_create_own_system_conversation() from authenticated;
-- drop function if exists public.get_or_create_own_system_conversation();
--
-- （notify_user() 回滚成 create_notify_user_function.sql 里的原始版本，
--  内联那段查找/创建逻辑，不调用共享函数——这里不重复贴一遍全文）
--
-- drop function if exists public.get_or_create_system_conversation(uuid);
