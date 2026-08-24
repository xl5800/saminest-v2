-- Migration: 修复 is_blocked_pair(uuid, uuid) 的越权查询漏洞
--
-- 为什么改：
--   上一份迁移（20260822020000_enforce_user_blocks_in_messaging.sql）里的
--   is_blocked_pair(user_a uuid, user_b uuid) 接受两个任意用户 id，且是
--   SECURITY DEFINER + 默认 PUBLIC 执行权限——这意味着任何登录用户都能拿
--   两个跟自己毫无关系的用户 id 调用
--   .rpc("is_blocked_pair", { user_a: "任意用户A", user_b: "任意用户B" })，
--   查出这两个人之间是否存在屏蔽关系。这直接违反了同一份迁移（
--   20260822010000_create_user_blocks_table.sql）给 user_blocks 表设计
--   RLS 时的意图——那张表的 SELECT 策略只允许 blocker_id = auth.uid()，
--   本来就是不想让任何人（包括被屏蔽的一方）能查到"谁屏蔽了谁"这份完整
--   名单，而 is_blocked_pair 这个 SECURITY DEFINER 函数直接绕开了这层
--   RLS，把整张表变相地暴露成了一个可以按任意两个 id 查询的公开接口。
--
--   修复方式：把函数改成单参数、不接受调用者自己指定"我是谁"，而是内部
--   直接绑定 auth.uid() 作为查询的一方——调用者只能查"我和某个人之间"的
--   屏蔽关系，查不了"任意两个不相关的人之间"的关系。
--
-- 影响哪些函数：
--   1. 新增 is_blocked_with(uuid) 取代 is_blocked_pair(uuid, uuid)。
--   2. is_blocked_in_conversation() 内部改调用 is_blocked_with()。
--   3. create_direct_conversation() / create_profile_conversation() /
--      create_activity_conversation() 三个函数内部改调用
--      is_blocked_with()——这三个函数原本传给 is_blocked_pair 的"调用者
--      自己那一侧"参数（v_buyer_id / v_actor_id）本来就恒等于 auth.uid()
--      （函数最开头 `:= auth.uid()` 赋值的），所以这里的替换是纯粹的
--      等价替换，不改变任何已有行为。
--   4. drop 掉旧的 is_blocked_pair(uuid, uuid)，不让两个函数并存造成
--      "到底该调用哪一个"的混淆，也避免旧函数的漏洞被遗留调用点继续触发。
--
-- 是否影响现有数据：不影响，只改函数定义。
--
-- 是否需要回滚方案：需要，见文件末尾（默认不执行，需要人工确认后单独
-- 运行——回滚会恢复本次修复的越权查询漏洞，不建议真的执行）。
--
-- 前端配套改动：src/repositories/user-blocks-repository.ts 的
-- isBlockedPair(userA, userB) 改名为 isBlockedWithUser(otherUserId)，
-- 内部改调用 .rpc("is_blocked_with", { other_user_id }) ——见该文件
-- 对应的注释。use-is-blocked-pair-query.ts 这个 hook 自己的外部签名
-- （currentUserId/otherUserId 两个参数，用于 enabled 判断和 queryKey）
-- 不用改，两个参数本来就一直是"当前登录用户 + 会话对方"，只是内部实际
-- 发给后端的 RPC 参数从两个变成一个。
--
-- 验证方式：本地 supabase db reset 之后，用三个真实注册的测试账号
-- （A/B/C，C 跟 A、B 都没有任何屏蔽关系），A 屏蔽 B 后：
--   - C 用自己的 access_token 调用 is_blocked_with 查"A 和 B 之间"的
--     关系——函数现在只接受一个参数，C 传什么 other_user_id 都只能查到
--     "C 自己和这个人之间"的关系，物理上已经无法表达"查 A 和 B 之间"这个
--     请求，天然不可能查到 A/B 之间存在屏蔽关系。
--   - A 或 B 用各自的 access_token 调用 is_blocked_with(对方 id)，
--     应该正确返回 true。
--   完整记录见任务卡回复。

-- ---------------------------------------------------------------------
-- 1. is_blocked_with(uuid) —— 判断"当前登录用户"和指定用户之间是否存在
--    任一方向的屏蔽关系。取代 is_blocked_pair(uuid, uuid)。
-- ---------------------------------------------------------------------
--
-- 不显式 revoke/grant execute——延续 is_blocked_pair 原来的先例，维持
-- Postgres 默认的 PUBLIC 执行权限：前端会直接
-- .rpc("is_blocked_with", { other_user_id })调用。对未登录的 anon 角色
-- 而言 auth.uid() 是 null，where 条件里的两个比较都不可能成立，不会
-- 返回任何行、也不会报错，同样安全。
--
-- 安全性：other_user_id 是调用者可以任意指定的，但查询条件里
-- auth.uid() 这一侧由数据库自己从当前会话的 JWT 里取，不接受调用者
-- 传参伪造——调用者只能查"我和 other_user_id 之间"的关系，查不到
-- "两个都不是我的用户之间"的关系，这正是相比 is_blocked_pair 的修复点。
create or replace function public.is_blocked_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 2. is_blocked_in_conversation(uuid, uuid)：内部改调用 is_blocked_with()
-- ---------------------------------------------------------------------
--
-- 这个函数自己的签名（target_conversation_id, target_user_id）不变——
-- target_user_id 仍然用来从"会话里的其他活跃成员"中排除掉这个人自己
-- （cm.user_id <> target_user_id），这一步跟屏蔽检查无关，不受这次修复
-- 影响。真正改的只是屏蔽检查那一行：原来调用
-- is_blocked_pair(target_user_id, cm.user_id)，现在改成
-- is_blocked_with(cm.user_id)（内部会用 auth.uid() 而不是
-- target_user_id 去比较）。这个仓库里这个函数唯一的调用点是 messages 表
-- 的 messages_insert_own_as_active_member 策略，调用方式固定是
-- is_blocked_in_conversation(messages.conversation_id, auth.uid())——
-- target_user_id 在这个唯一调用点上恒等于 auth.uid()，所以这个替换是
-- 等价替换，不改变任何已有行为；额外的好处是就算以后有人直接
-- .rpc("is_blocked_in_conversation", ...) 传一个不是自己的 target_user_id
-- 进来，函数内部的屏蔽判断也只会反映真实调用者自己的屏蔽关系，不会被
-- 用来查询"target_user_id 和会话里其他人"之间的关系——不会重新引入
-- is_blocked_pair 那种越权查询。
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
      and public.is_blocked_with(cm.user_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 3. create_direct_conversation()：内部改调用 is_blocked_with()
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

  -- v_buyer_id 恒等于 auth.uid()（本函数开头赋值），is_blocked_with()
  -- 内部也是拿 auth.uid() 去比较，所以这里只需要传对方一个 id。
  if public.is_blocked_with(v_seller_id) then
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
-- 4. create_profile_conversation()：内部改调用 is_blocked_with()
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

  -- v_actor_id 恒等于 auth.uid()，理由同 create_direct_conversation。
  if public.is_blocked_with(target_user_id) then
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
-- 5. create_activity_conversation()：内部改调用 is_blocked_with()
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

  -- v_actor_id 恒等于 auth.uid()，理由同 create_direct_conversation。
  if public.is_blocked_with(v_organizer_id) then
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
-- 6. 删掉旧的 is_blocked_pair(uuid, uuid)——不让新旧两个函数并存
-- ---------------------------------------------------------------------
--
-- 上面 1～5 已经把所有已知调用点（is_blocked_in_conversation 和三个
-- create_*_conversation 函数）改成调用 is_blocked_with，这里可以安全地
-- drop 掉旧函数，防止遗漏的调用点（或者以后有人重新引入）继续暴露最初
-- 那个越权查询漏洞。
drop function if exists public.is_blocked_pair(uuid, uuid);

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会恢复本次修复的
-- 越权查询漏洞，不建议真的执行）：
--
-- create or replace function public.is_blocked_pair(user_a uuid, user_b uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select exists (
--     select 1
--     from public.user_blocks
--     where (blocker_id = user_a and blocked_id = user_b)
--        or (blocker_id = user_b and blocked_id = user_a)
--   );
-- $$;
--
-- （is_blocked_in_conversation / 三个 create_*_conversation 函数的回滚
-- 需要手动把本文件里 is_blocked_with(...) 的调用改回
-- is_blocked_pair(对应两个参数)，恢复成
-- 20260822020000_enforce_user_blocks_in_messaging.sql 里的版本，不在这里
-- 自动生成完整函数体。）
--
-- drop function if exists public.is_blocked_with(uuid);
