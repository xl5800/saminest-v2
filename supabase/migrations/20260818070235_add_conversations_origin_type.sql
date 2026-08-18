-- Migration: conversations.origin_type — 区分会话是从帖子/活动/个人主页
-- 哪个入口发起的
--
-- 为什么改：
--   即将新增"点头像进个人主页→发消息"这个入口（create_profile_conversation
--   函数，另一份迁移），需要对这类"随时可以对任意用户发起"的会话做每日
--   限流，防止被用来批量骚扰/发广告。但现有 conversations 表看不出一条
--   会话是从帖子联系卖家、活动报名通知、还是个人主页私信这三种入口的
--   哪一种创建的——post_id 不为空能认出"帖子"这一种，但"活动"和"个人
--   主页"这两种目前都是 post_id 为空，没法区分，没法只统计"个人主页"
--   这一种的每日限流。这里加一列显式记录来源，不用 post_id 是否为空这种
--   隐式推断。
--
-- 影响哪些表：
--   public.conversations 加一列 origin_type，回填现有数据，重新定义
--   create_direct_conversation() / create_activity_conversation() 让它们
--   在 insert 时显式写这一列（不依赖以后再靠 post_id 推断）。
--
-- 是否影响现有数据：
--   加列 + 回填，不删除/不修改现有行的其它字段。回填规则：post_id 不为
--   空的历史行都是通过 create_direct_conversation() 创建的（这是这个函数
--   唯一的会话来源），标成 'post'；post_id 为空的历史行都是通过
--   create_activity_conversation() 创建的（这个项目上线以来，post_id 为
--   空的会话只有这一个创建入口，create_profile_conversation 是这份迁移
--   之后才存在的新入口，历史数据里不可能有这一种），标成 'activity'。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.conversations
  add column origin_type text null;

update public.conversations
set origin_type = case when post_id is not null then 'post' else 'activity' end
where origin_type is null;

alter table public.conversations
  alter column origin_type set not null;

alter table public.conversations
  add constraint conversations_origin_type_check
    check (origin_type in ('post', 'activity', 'profile'));

comment on column public.conversations.origin_type is
  '会话是从哪个入口创建的：post=联系帖子发布者，activity=活动报名/退出通知，profile=个人主页点头像发消息。用于区分 create_profile_conversation() 每日限流只统计 profile 这一种，不影响另外两种。';

-- create_direct_conversation()：insert 时显式写 origin_type = 'post'，
-- 不再靠以后查询时用 post_id is not null 反推——函数签名/其它逻辑不变，
-- 只是 insert 语句多了这一列。
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

  insert into public.conversations (type, post_id, created_by, origin_type)
  values ('direct', target_post_id, v_buyer_id, 'post')
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

-- create_activity_conversation()：同样只在 insert 语句里加 origin_type =
-- 'activity'，函数其它部分逐字不变。
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
    insert into public.conversations (type, post_id, created_by, origin_type)
    values ('direct', null, v_actor_id, 'activity')
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

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- （先把两个函数 create or replace 回加这份迁移之前的版本——见
--  20260717000700_account_status_enforcement.sql 里 create_direct_conversation
--  的定义、20260815182042_create_activity_conversation_function.sql 里
--  create_activity_conversation 的定义，逐字复制回去，去掉 origin_type
--  这一列即可，这里不重复贴一遍全文）
--
-- alter table public.conversations drop constraint conversations_origin_type_check;
-- alter table public.conversations drop column origin_type;
