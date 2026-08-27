-- Migration: 16 号卡「对话去重」——两个人之间只保留一条会话 + 联系上下文
-- 改成会话内的引用消息
--
-- 为什么改：
--   现在联系同一个人，如果是因为不同的帖子/活动分别点的"联系"，会产生
--   好几条独立会话（消息列表里同一个人出现好几行）。根因是三个会话创建
--   入口（create_direct_conversation / create_activity_conversation /
--   create_profile_conversation）各自维护一份不一致的"查找已有会话"逻辑：
--     - create_direct_conversation：靠 (post_id, created_by) 部分唯一索引
--       去重，同一买家对同一帖子只有一条会话，但换一个帖子（哪怕卖家
--       是同一个人）就会另开一条。
--     - create_activity_conversation：只按 created_by = 当前操作者查找，
--       不查对方发起的方向——如果对方也曾经主动联系过当前用户，这里查
--       不到那条会话，会另开一条。
--     - create_profile_conversation：唯一一个已经做对了"双向按用户对
--       查找"的入口，但只在 origin_type = 'profile' 范围内查，不会复用
--       post/activity 场景下已经建好的会话。
--   三份逻辑各查各的范围，同一对用户可能同时有一条 post 会话、一条
--   activity 会话、一条 profile 会话，这就是现在看到的重复。
--
--   这次不合并/迁移历史遗留的重复会话（原样保留），只保证这次改完之后，
--   新产生的联系不会再拆出新会话——已有的 16 条历史会话不受这份迁移
--   影响（沿用它们各自原来的字段值），新的查找/创建行为只对"这次调用
--   之后新发生的联系"生效。
--
-- 影响哪些表/函数：
--   1. public.messages 新增两个可空列 ref_post_id / ref_activity_id
--      （+ 两个外键 + 一个"至多一个非空"的 check 约束），供"联系上下文"
--      引用消息使用，见下方 3。
--   2. 新增 4 个内部共享 SECURITY DEFINER 函数（不 grant 给 authenticated，
--      只能被本文件内的三个入口函数调用，不是新的公开 RPC 面）：
--        - find_direct_conversation_between(uuid, uuid)：双向查找两人
--          之间已有的 direct 会话，不限 post_id/origin_type。
--        - create_direct_conversation_row(uuid, uuid, text)：新建一条
--          direct 会话 + 两条成员行，post_id 恒为 null（会话不再绑定
--          单个帖子/活动，见下方 3）。
--        - get_or_create_direct_conversation(uuid, uuid, text)：屏蔽检查
--          + 上面两个函数的组合，供 create_direct_conversation /
--          create_activity_conversation 直接调用。
--        - insert_conversation_reference_message(...)：插入一条纯文字
--          的"联系上下文"消息。
--      这就是 16.2 要求的"统一的查找或创建两人会话方法"落地的地方——
--      不在前端/PostgREST 层面新增一个多态入口（这个仓库里
--      createDirectConversation/createActivityConversation/
--      createProfileConversation 三个各自独立、按调用场景命名的前端
--      函数，本来就是这个项目一贯的风格，见 favorites-repository.ts
--      收藏帖子/收藏活动那两个独立函数的同一段说明），而是把三份
--      查找/创建逻辑之间真正重复、容易长歪的部分收敛成数据库层这一处
--      共享实现，三个前端可见的入口函数签名/调用方式完全不变。
--   3. 重建 create_direct_conversation() / create_activity_conversation()：
--      内部改调用 2 里的共享函数；新建会话时 post_id 固定传 null（联系
--      的上下文从"会话的属性"改成"会话里的一条消息"，不再需要
--      conversations.post_id 这一列继续为新会话记录"关于哪个帖子"）；
--      成功获取/创建会话后，追加插入一条 ref_post_id/ref_activity_id
--      指向对应帖子/活动的引用消息，正文"关于：《帖子/活动标题》"。
--
--      顺带修复一个现有 bug：这两个函数当前部署的版本（
--      20260823000000_restrict_is_blocked_pair_to_caller.sql 把
--      is_blocked_pair 换成 is_blocked_with 时，连带把函数体整个
--      copy-paste 成了 20260818070235_add_conversations_origin_type.sql
--      之前、还没加 origin_type 列时的旧版本）insert 语句里漏掉了
--      origin_type 这一列，而这一列现在是 not null 且没有默认值——
--      意味着这两个函数当前在需要真正新建一条会话时（不是复用已有
--      会话）会直接报"null value in column origin_type violates
--      not-null constraint"，新的联系人第一次通过帖子/活动联系时会
--      失败（已经存在的 16 条历史会话不受影响，因为那些请求会命中
--      "已有会话，直接返回"分支，走不到这条坏掉的 insert）。这次重写
--      顺带把这个线上 bug 一起修掉，不是这份迁移单独要做的事，只是
--      正好在改的这几行代码里。
--
--      create_profile_conversation() 本身没有这个 bug（它的 insert 语句
--      一直正确带着 origin_type），这次改动是把它内部重复的"双向查找" /
--      "插入会话+成员"两段逻辑换成调用 2 里新增的
--      find_direct_conversation_between() / create_direct_conversation_row()，
--      屏蔽检查、每日限流的位置和判断条件完全不变（限流依然只统计
--      "真的新建"的 profile 会话，找到已有会话直接返回，不计入限流）。
--
-- 是否影响现有数据：
--   messages 新列默认 null，不影响历史消息；三个函数只影响"这次迁移
--   之后新发生的调用"，不回填/不改动任何现有 conversations/messages 行。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独
--   运行——回滚会恢复 origin_type 的 not-null 违反 bug 和三份不一致的
--   查找逻辑，不建议真的执行）。

-- =====================================================================
-- 1. messages：新增引用消息用的两列
-- =====================================================================

alter table public.messages
  add column ref_post_id uuid null references public.posts (id),
  add column ref_activity_id uuid null references public.activities (id);

comment on column public.messages.ref_post_id is
  '这条消息关联的帖子（16 号卡"联系上下文"引用消息用）。跟 ref_activity_id 至多一个非空，见 messages_ref_single_check；两个都为空是普通消息（不是引用消息）。';
comment on column public.messages.ref_activity_id is
  '这条消息关联的活动（16 号卡"联系上下文"引用消息用）。跟 ref_post_id 至多一个非空，见 messages_ref_single_check。';

alter table public.messages
  add constraint messages_ref_single_check
    check (not (ref_post_id is not null and ref_activity_id is not null));

create index messages_ref_post_id_idx on public.messages (ref_post_id) where ref_post_id is not null;
create index messages_ref_activity_id_idx on public.messages (ref_activity_id) where ref_activity_id is not null;

-- =====================================================================
-- 2. 共享内部函数（不 grant authenticated——只给本文件下面三个入口函数
--    内部调用，不是新增的公开 RPC 面）
-- =====================================================================

-- 双向查找两人之间已有的 direct 会话——不限 post_id/origin_type，这是
-- 跟改之前三份各查各的逻辑相比唯一真正的行为变化点：只要两人之间存在
-- 任意一条（不管当初是从哪个入口建的）未软删除的 direct 会话，就复用它。
create or replace function public.find_direct_conversation_between(
  p_user_a uuid,
  p_user_b uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.conversations c
  where c.type = 'direct'
    and c.deleted_at is null
    and exists (
      select 1 from public.conversation_members cm1
      where cm1.conversation_id = c.id and cm1.user_id = p_user_a
    )
    and exists (
      select 1 from public.conversation_members cm2
      where cm2.conversation_id = c.id and cm2.user_id = p_user_b
    )
  limit 1;
$$;

revoke execute on function public.find_direct_conversation_between(uuid, uuid) from public;

-- 新建一条 direct 会话 + 两条成员行。post_id 固定传 null——联系的上下文
-- 现在是会话里的一条引用消息（见 insert_conversation_reference_message），
-- 不再是会话本身的属性，新建的会话不需要再挂在某一个具体帖子下面。
create or replace function public.create_direct_conversation_row(
  p_actor_id uuid,
  p_other_user_id uuid,
  p_origin_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  insert into public.conversations (type, post_id, created_by, origin_type)
  values ('direct', null, p_actor_id, p_origin_type)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, p_actor_id),
    (v_conversation_id, p_other_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke execute on function public.create_direct_conversation_row(uuid, uuid, text) from public;

-- 16.2 要求的"统一的查找或创建两人会话方法"：屏蔽检查（复用
-- is_blocked_with()，这个函数内部按 auth.uid() 判断，调用方必须保证
-- p_actor_id 就是当前登录用户本人——create_direct_conversation /
-- create_activity_conversation 传的 v_buyer_id/v_actor_id 恒等于
-- auth.uid()，满足这个前提）+ 查找 + 找不到再新建。
--
-- create_profile_conversation 不走这个组合函数——它需要在"找到已有会话
-- 就直接返回、不计入限流"和"真的要新建才检查/计入每日限流"之间插入一步
-- 限流判断，所以单独调用 find_direct_conversation_between /
-- create_direct_conversation_row 这两个更小的函数，自己控制两步之间的
-- 顺序，见下面 create_profile_conversation 的重建。
create or replace function public.get_or_create_direct_conversation(
  p_actor_id uuid,
  p_other_user_id uuid,
  p_new_origin_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if public.is_blocked_with(p_other_user_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  v_conversation_id := public.find_direct_conversation_between(p_actor_id, p_other_user_id);

  if v_conversation_id is null then
    v_conversation_id := public.create_direct_conversation_row(
      p_actor_id, p_other_user_id, p_new_origin_type
    );
  end if;

  return v_conversation_id;
end;
$$;

revoke execute on function public.get_or_create_direct_conversation(uuid, uuid, text) from public;

-- 16.3：插入一条"联系上下文"引用消息——纯文字（这一版不做缩略图/可点击
-- 卡片），sender_id 是真实发起联系的用户（不是系统虚拟账号，区别于
-- add_system_notification_support 那批的"系统通知"消息，那类是
-- sender_id 为 null + notification_payload 结构化内容，服务的是完全
-- 不同的场景——管理员/系统广播，不是"我为什么联系你"这个上下文），
-- ref_post_id/ref_activity_id 两者恰好一个非空，供前端识别渲染成
-- "居中小灰条"样式而不是普通聊天气泡。
create or replace function public.insert_conversation_reference_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text,
  p_ref_post_id uuid,
  p_ref_activity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.messages (conversation_id, sender_id, message_type, body, ref_post_id, ref_activity_id)
  values (p_conversation_id, p_sender_id, 'text', p_body, p_ref_post_id, p_ref_activity_id);
end;
$$;

revoke execute on function public.insert_conversation_reference_message(uuid, uuid, text, uuid, uuid) from public;

-- =====================================================================
-- 3. 重建三个入口函数
-- =====================================================================

-- create_direct_conversation()：内部改调用共享函数，新建/复用到会话后
-- 追加一条"关于：《帖子标题》"的引用消息。顺带修复当前部署版本遗漏
-- origin_type 导致新建会话必定报错的 bug（见文件头说明）。
create or replace function public.create_direct_conversation(target_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_seller_id uuid;
  v_post_title text;
  v_conversation_id uuid;
begin
  if v_buyer_id is null then
    raise exception 'create_direct_conversation requires an authenticated user';
  end if;

  select author_id, title into v_seller_id, v_post_title
  from public.posts
  where id = target_post_id
    and deleted_at is null;

  if v_seller_id is null then
    raise exception 'post % not found', target_post_id;
  end if;

  if v_seller_id = v_buyer_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  v_conversation_id := public.get_or_create_direct_conversation(v_buyer_id, v_seller_id, 'post');

  perform public.insert_conversation_reference_message(
    v_conversation_id,
    v_buyer_id,
    '关于：《' || v_post_title || '》',
    target_post_id,
    null
  );

  return v_conversation_id;
end;
$$;

-- create_activity_conversation()：同上，改调用共享函数 + 追加"关于：
-- 《活动标题》"引用消息，同样顺带修复 origin_type 缺失的 bug。
create or replace function public.create_activity_conversation(target_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organizer_id uuid;
  v_activity_title text;
  v_conversation_id uuid;
begin
  if v_actor_id is null then
    raise exception 'create_activity_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select organizer_id, title into v_organizer_id, v_activity_title
  from public.activities
  where id = target_activity_id
    and deleted_at is null;

  if v_organizer_id is null then
    raise exception 'activity % not found', target_activity_id;
  end if;

  if v_organizer_id = v_actor_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  v_conversation_id := public.get_or_create_direct_conversation(v_actor_id, v_organizer_id, 'activity');

  perform public.insert_conversation_reference_message(
    v_conversation_id,
    v_actor_id,
    '关于：《' || v_activity_title || '》',
    null,
    target_activity_id
  );

  return v_conversation_id;
end;
$$;

-- create_profile_conversation()：双向查找 + 新建两段换成调用共享函数，
-- 屏蔽检查/每日限流的位置和判断条件不变（找到已有会话直接返回、不计入
-- 限流；真的要新建才检查/计入限流）。没有帖子/活动上下文，不插引用
-- 消息——这本来就是"点头像直接发消息"场景，没有"关于哪个帖子/活动"这
-- 件事可以引用。
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

  if public.is_blocked_with(target_user_id) then
    raise exception 'blocked users cannot start a conversation with each other';
  end if;

  v_conversation_id := public.find_direct_conversation_between(v_actor_id, target_user_id);

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select count(*) into v_today_new_conversation_count
  from public.conversations c
  where c.created_by = v_actor_id
    and c.origin_type = 'profile'
    and c.created_at >= date_trunc('day', now());

  if v_today_new_conversation_count >= c_daily_limit then
    raise exception 'daily new conversation limit reached';
  end if;

  v_conversation_id := public.create_direct_conversation_row(v_actor_id, target_user_id, 'profile');

  return v_conversation_id;
end;
$$;

-- 三个入口函数的 execute 权限（authenticated 可调用、anon 不可调用）在
-- 之前的迁移里已经 grant 过，create or replace 不会重置已有的权限授予，
-- 这里不需要重复 grant。

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会恢复
-- origin_type 缺失导致新建会话报错的 bug，以及三份不一致、部分场景
-- 会重复建会话的查找逻辑，不建议真的执行）：
--
-- drop function if exists public.get_or_create_direct_conversation(uuid, uuid, text);
-- drop function if exists public.create_direct_conversation_row(uuid, uuid, text);
-- drop function if exists public.find_direct_conversation_between(uuid, uuid);
-- drop function if exists public.insert_conversation_reference_message(uuid, uuid, text, uuid, uuid);
--
-- （create_direct_conversation / create_activity_conversation /
--  create_profile_conversation 三个函数的回滚需要手动恢复成
--  20260823000000_restrict_is_blocked_pair_to_caller.sql 里的版本，
--  不在这里自动生成完整函数体。）
--
-- alter table public.messages drop constraint messages_ref_single_check;
-- drop index if exists messages_ref_post_id_idx;
-- drop index if exists messages_ref_activity_id_idx;
-- alter table public.messages drop column ref_post_id;
-- alter table public.messages drop column ref_activity_id;
