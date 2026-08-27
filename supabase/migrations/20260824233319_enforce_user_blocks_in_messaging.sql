-- Migration: 屏蔽关系生效到私信（会话创建 + 已有会话发消息）
--
-- 为什么改：
--   上一份迁移（20260822010000_create_user_blocks_table.sql）只建了
--   user_blocks 表和"用户自己维护自己屏蔽名单"的基础 RLS，本身不影响
--   任何现有功能。这份迁移是让屏蔽关系真正"生效"的那一步：
--     1. 三个会话创建入口（create_direct_conversation /
--        create_profile_conversation / create_activity_conversation）
--        在双方存在屏蔽关系（任一方向）时拒绝创建/获取会话。
--     2. 已经存在的会话里，如果双方之后产生了屏蔽关系，任一方都不能再往
--        这条会话里发新消息——messages_insert_own_as_active_member 这条
--        INSERT 策略补上屏蔽检查。
--   两点合起来对应 Apple-UGC-Compliance-Review.md 第四节"屏蔽后至少要
--   生效在两个地方"这条最小闭环要求。
--
-- 影响哪些表：
--   不新建表。新增两个 security definer 辅助函数
--   （is_blocked_pair / is_blocked_in_conversation），重建
--   create_direct_conversation() / create_profile_conversation() /
--   create_activity_conversation() 三个已有函数（drop + create or
--   replace 都不需要，plpgsql 函数用 create or replace 直接覆盖旧定义），
--   重建 messages 表的 messages_insert_own_as_active_member 这条策略。
--
-- 是否影响现有数据：
--   不影响任何现有行；user_blocks 表目前是空的（上一份迁移刚建），这份
--   迁移生效后不会有任何已有会话因为"回溯性地"产生屏蔽关系而突然不能发
--   消息——只有以后真的发生新的屏蔽操作，才会拦住之后的发送尝试。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 判断双向屏蔽关系为什么要用一个公共 SECURITY DEFINER 函数、不写三份
-- 重复逻辑：
--   一是避免"改了 A 处的判断条件，忘了同步改 B/C 处"这种容易漏改的重复
--   代码；二是 messages_insert_own_as_active_member 这条 RLS 策略需要
--   查 conversation_members 表判断"这条会话里除了我之外的其他活跃成员
--   有没有跟我互相屏蔽"——这个仓库已经在 comments（
--   20260805000000_fix_comments_insert_delete_infinite_recursion.sql）
--   和 conversation_members 自己（
--   20260717000000_fix_conversation_members_rls_recursion.sql）上踩过
--   两次"RLS 策略里直接内联查询自己所在表/关联表，触发 42P17 无限递归"
--   的坑，两次都是同一个修法：把查询包进一个 SECURITY DEFINER 函数，
--   函数内部的查询以函数属主身份执行、天然绕过被查询表自身的 RLS，不会
--   重新触发调用方所在的那条策略。这份迁移直接照抄这个已经验证过的模式，
--   不重新发明一个没验证过的写法：
--     is_blocked_pair(uuid, uuid) 只查 user_blocks，不查 messages/
--     conversation_members，本身不构成任何递归。
--     is_blocked_in_conversation(uuid, uuid) 会查 conversation_members，
--     但它是被 messages 表的策略调用，读取的是另一张表
--     （conversation_members），不是 messages 自己，所以即使不包一层
--     SECURITY DEFINER 也不会触发"messages 策略递归查 messages"这种
--     严格意义上的自引用递归——包一层的原因是防御性的：函数内部对
--     conversation_members 的查询如果不绕过 RLS，会重新触发
--     conversation_members_select_of_own_conversations 这条策略求值
--     （那条策略本身已经通过 is_conversation_member() 打破了它自己的
--     递归，不会再报错），但让 messages 的 INSERT 检查依赖另一张表的
--     RLS 策略链路是不必要的间接依赖，包成 SECURITY DEFINER 函数后
--     这个判断只走一次简单查询，语义更直接、也更不容易在以后
--     conversation_members 的策略被改动时被意外波及。
--
-- 三处会话创建函数加检查的位置：统一放在"不能和自己建会话"这条检查之后、
-- 真正插入新会话之前（对 create_profile_conversation 而言，也在它的
-- "双向查找已有会话"这个复用分支之前——被屏蔽之后不应该连"拿到一个已有
-- 会话 id 并跳转过去"都还能做到，被拦截的应该是"这两个人之间的整条私信
-- 通道"，不只是"新建"这一个动作，跟已有会话里不能再发消息是同一个
-- 完整闭环）。
--
-- 验证方式：见任务卡回复里的手动验证记录（本地 supabase db reset 之后，
-- 用两个真实注册的测试账号，通过 REST API 用各自的 access_token 实测
-- 三个 RPC 创建会话 + 已有会话发消息 + 屏蔽/取消屏蔽 的完整链路）。

-- ---------------------------------------------------------------------
-- 1. is_blocked_pair(uuid, uuid) —— 判断两个用户之间是否存在任一方向的
--    屏蔽关系
-- ---------------------------------------------------------------------
--
-- 不显式 revoke/grant execute——跟 is_conversation_member() /
-- is_active_conversation_member() 是同一个先例（见
-- 20260805000000_fix_comments_insert_delete_infinite_recursion.sql 的
-- 姐妹迁移 20260717000000_fix_conversation_members_rls_recursion.sql），
-- 这类只读、不暴露敏感信息之外内容的布尔判断函数维持 Postgres 默认的
-- PUBLIC 执行权限，不需要像三个会话创建函数那样显式收紧到只给
-- authenticated——这两个函数本身也故意设计成可以被前端直接
-- .rpc("is_blocked_pair", ...) 调用（比如会话详情页据此提前把"发送"按钮
-- 换成一条提示文案，而不是等用户点了发送才在报错里发现），不是纯粹的
-- 内部实现细节。
create or replace function public.is_blocked_pair(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. is_blocked_in_conversation(uuid, uuid) —— 判断某个会话里，除了指定
--    用户之外的其他"当前活跃"成员，有没有任何一个跟这个用户互相屏蔽
-- ---------------------------------------------------------------------
--
-- V1 的 direct 会话固定两个活跃成员，实际效果等价于"另一个人是否跟我
-- 互相屏蔽"；写成"排除自己、遍历其他活跃成员"这个更通用的形式，是为了
-- 不在未来会话支持多人（文档里 conversations.type 预留了 group）时又要
-- 回头改这个函数。
create or replace function public.is_blocked_in_conversation(
  target_conversation_id uuid,
  target_user_id uuid
)
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
      and cm.user_id <> target_user_id
      and cm.left_at is null
      and public.is_blocked_pair(target_user_id, cm.user_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 3. create_direct_conversation()：加屏蔽检查
-- ---------------------------------------------------------------------

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
begin
  if v_buyer_id is null then
    raise exception 'create_direct_conversation requires an authenticated user';
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

  if public.is_blocked_pair(v_buyer_id, v_seller_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  insert into public.conversations (type, post_id, created_by)
  values ('direct', target_post_id, v_buyer_id)
  on conflict (post_id, created_by)
    where type = 'direct' and deleted_at is null
  do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.conversations
    where post_id = target_post_id
      and created_by = v_buyer_id
      and type = 'direct'
      and deleted_at is null;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_buyer_id),
    (v_conversation_id, v_seller_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. create_profile_conversation()：加屏蔽检查（在自己发消息检查之后、
--    双向复用已有会话查找之前——见文件顶部说明）
-- ---------------------------------------------------------------------

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

  if public.is_blocked_pair(v_actor_id, target_user_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  -- 双向查找已有的 profile 会话（见原迁移设计要点 1），找到就直接复用，
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

  -- 只有真的要新建一条会话时才检查/计入每日限流（见原迁移设计要点 2）。
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

-- ---------------------------------------------------------------------
-- 5. create_activity_conversation()：加屏蔽检查
-- ---------------------------------------------------------------------

create or replace function public.create_activity_conversation(target_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organizer_id uuid;
  v_conversation_id uuid;
begin
  if v_actor_id is null then
    raise exception 'create_activity_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select organizer_id into v_organizer_id
  from public.activities
  where id = target_activity_id
    and deleted_at is null;

  if v_organizer_id is null then
    raise exception 'activity % not found', target_activity_id;
  end if;

  if v_organizer_id = v_actor_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  if public.is_blocked_pair(v_actor_id, v_organizer_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  -- "获取或创建"：找一条已有的、由当前操作者发起、对方是目标发起人、
  -- post_id 为空的 direct 会话，找到就复用，避免同一对用户之间反复报名/
  -- 退出不同活动时无限新建会话。找不到再新建（见原迁移文件头注释的取舍）。
  select c.id into v_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and c.post_id is null
    and c.deleted_at is null
    and c.created_by = v_actor_id
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = c.id
        and cm.user_id = v_organizer_id
    )
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type, post_id, created_by)
    values ('direct', null, v_actor_id)
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values
      (v_conversation_id, v_actor_id),
      (v_conversation_id, v_organizer_id)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. messages_insert_own_as_active_member：加屏蔽检查
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
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会恢复"屏蔽之后仍然
-- 能互相发起会话/发消息"这个已知问题，不建议真的执行）：
--
-- drop policy if exists messages_insert_own_as_active_member on public.messages;
-- create policy messages_insert_own_as_active_member
--   on public.messages
--   for insert
--   to authenticated
--   with check (
--     sender_id = auth.uid()
--     and public.is_active_conversation_member(messages.conversation_id)
--   );
--
-- （create_direct_conversation / create_profile_conversation /
--  create_activity_conversation 三个函数的回滚需要手动去掉本文件加的
--  is_blocked_pair 检查那几行，恢复成各自上一份迁移文件里的版本，不在
--  这里自动生成完整函数体，避免这份回滚注释本身跟三份分散在不同历史
--  迁移文件里的"上一版本"脱节。）
--
-- drop function if exists public.is_blocked_in_conversation(uuid, uuid);
-- drop function if exists public.is_blocked_pair(uuid, uuid);
