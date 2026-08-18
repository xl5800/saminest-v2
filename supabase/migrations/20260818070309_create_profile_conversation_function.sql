-- Migration: create_profile_conversation() — 个人主页"发消息"的私信入口，
-- 带每日新建会话限流
--
-- 为什么改：
--   社交资料页第一批："点头像→个人主页→发消息"需要能对任意其他用户
--   发起私聊，不像 create_direct_conversation（绑定帖子）/
--   create_activity_conversation（绑定活动）那样有一个具体的业务场景把
--   "能联系谁"限定在一个范围内。这本质上是重新打开 P0 阶段刻意堵上的
--   "可以拉任意用户建私聊"这个口子（见 create_activity_conversation 那份
--   迁移文件里的说明）——这次是产品明确要开放的新入口，不是不小心开的，
--   但必须同时带上最基础的滥用防护，所以这份迁移把"开放入口"和"每日限流"
--   放在同一个函数里一起做，不分两步上线。
--
-- 影响哪些表：
--   不新建表、不加列（origin_type 已经在上一份迁移里加好了）。只新增一个
--   函数 create_profile_conversation(uuid)。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 设计要点：
--   1. "获取或创建"的复用判断跟 create_activity_conversation 不一样：那个
--      函数只按 created_by = 当前操作者去找已有会话（因为它的调用方向
--      固定是"报名/退出的人主动通知发起人"）。这里的调用方向是双向的——
--      A 可能先点 B 的头像发消息，之后 B 也可能反过来点 A 的头像发消息，
--      如果还是只按 created_by = 当前操作者去找，会导致 A 和 B 之间建出
--      两条独立的 profile 会话（一条 A 建的、一条 B 建的），不符合"一对
--      用户之间只应该有一条个人主页私信"的直觉。所以这里改成不分方向地
--      查"这两个人是不是已经同时是某条 origin_type = 'profile' 会话的
--      成员"，双向都能复用到同一条。
--   2. 限流只统计"这次调用之前，调用者今天已经通过这个函数新建了多少条
--      会话"——注意是"新建"，不是"调用次数"：如果双方已经有一条 profile
--      会话，反复调用这个函数（比如每次进对方主页点一次"发消息"）只是
--      拿到同一个 conversation_id，不算一次新建，不计入限流，不应该因为
--      "已经在聊的人"被拦。
--   3. 限额先给 8（每人每天最多对 8 个新的陌生人发起私聊），硬编码在
--      函数体内，不建配置表——这个项目里其它数值上限（MESSAGE_MAX_LENGTH、
--      MAX_POST_IMAGES 等）也都是代码里硬编码的常量，不是数据库配置项，
--      这里延续同一个做法。以后如果需要经常调整这个值，再考虑要不要挪到
--      配置表。
--   4. 异常文本 'daily new conversation limit reached' 是特意跟其它异常
--      文本（比如 restricted accounts...）区分开、可以被前端用
--      error.message.includes(...) 单独识别的一段英文短语，前端据此换成
--      对用户友好的中文提示，不直接把这段英文抛给用户看。
--   5. 不检查目标用户自己的账号状态（是否被限制/封禁）——跟
--      create_activity_conversation 对"目标发起人"不做状态检查是同一个
--      先例，这次不额外发明新规则。如果以后要支持"被封禁用户不能被私信"，
--      需要单独一份迁移。

create or replace function public.create_profile_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_conversation_id uuid;
  v_target_exists boolean;
  v_today_new_conversation_count int;
  c_daily_limit constant int := 8;
begin
  if v_actor_id is null then
    raise exception 'create_profile_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id and p.deleted_at is null
  ) into v_target_exists;

  if not v_target_exists then
    raise exception 'profile % not found', target_user_id;
  end if;

  if target_user_id = v_actor_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  -- 双向查找已有的 profile 会话（见文件头设计要点 1），找到就直接复用，
  -- 不进入下面的限流判断。
  select c.id into v_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and c.origin_type = 'profile'
    and c.deleted_at is null
    and exists (
      select 1 from public.conversation_members cm1
      where cm1.conversation_id = c.id and cm1.user_id = v_actor_id
    )
    and exists (
      select 1 from public.conversation_members cm2
      where cm2.conversation_id = c.id and cm2.user_id = target_user_id
    )
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- 只有真的要新建一条会话时才检查/计入每日限流（见设计要点 2）。
  select count(*) into v_today_new_conversation_count
  from public.conversations c
  where c.created_by = v_actor_id
    and c.origin_type = 'profile'
    and c.created_at >= date_trunc('day', now());

  if v_today_new_conversation_count >= c_daily_limit then
    raise exception 'daily new conversation limit reached';
  end if;

  insert into public.conversations (type, post_id, created_by, origin_type)
  values ('direct', null, v_actor_id, 'profile')
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_actor_id),
    (v_conversation_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke execute on function public.create_profile_conversation(uuid) from public;
grant execute on function public.create_profile_conversation(uuid) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.create_profile_conversation(uuid) from authenticated;
-- drop function if exists public.create_profile_conversation(uuid);
