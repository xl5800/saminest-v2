-- Migration: create_activity_conversation() — 活动报名/退出通知的私信入口
--
-- 为什么改：
--   "一起去"功能第二批要求报名/退出活动时，给发起人发一条私信提醒，发送人
--   是操作者本人（不是虚拟系统账号），这样发起人可以直接在同一个对话里
--   回复。现有唯一的会话创建入口 create_direct_conversation(target_post_id)
--   （见 20260716000400_create_messaging_tables.sql，20260717000700 加了
--   is_account_restricted 检查）是硬绑定 posts 的：函数体内直接
--   `select author_id from public.posts where id = target_post_id`，
--   `conversations.post_id` 外键也只指向 `public.posts`。活动
--   （`public.activities`，见 20260815042354_create_go_together_activities_schema，
--   这份迁移当时是直接在 Dashboard/MCP 上执行的，没有对应的本地迁移文件——
--   这是一个已知的既有缺口，这次不顺带补，只在这里记录一下）不是
--   posts，没有任何路径能让现有函数认得"活动的发起人是谁"，也不能传一个
--   活动 id 进去当 target_post_id（会直接落进"post % not found"分支报错）。
--
--   因为 conversations / conversation_members 两张表都没有对 authenticated
--   角色开放任何直接 INSERT 的 RLS 策略（唯一入口就是 security definer
--   函数，见 20260716000400 的详细说明），"活动报名通知"这个场景在不新增
--   任何数据库对象的前提下是做不到的——不存在能绕过这个限制的纯前端方案。
--   这里选择最小化扩展：新增一个和 create_direct_conversation 同构的
--   security definer 函数 create_activity_conversation(target_activity_id)，
--   不改动、不复用现有函数的签名（不给 create_direct_conversation 加可选
--   参数改成"帖子或活动通用"，那样会让一个本来只服务 posts 的函数承担
--   两种不相关的业务语义，也会让 posts 场景意外多出一条从来不会走到的
--   判断分支），只新增，不修改任何已有函数/策略/表结构。
--
-- 影响哪些表：
--   不新建表、不加列。只新增一个函数 create_activity_conversation(uuid)。
--   函数体内会 insert 到 public.conversations / public.conversation_members
--   两张已有表（复用它们已有的字段，conversations.post_id 这次固定传
--   null——这两张表的表结构从设计上就允许"不挂在任何帖子下的会话"，
--   post_id 列本来就是 nullable，不是新开的口子）。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行，也不影响 create_direct_conversation 已有的
--   行为（那个函数完全没有改动）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 已知的取舍（这次没有做、以后如果需要可以再补一份迁移）：
--   1. 复用会话的判断依据是"由当前操作者发起、且对方是目标活动发起人、
--      且 post_id 为空"的既有 direct 会话，不是数据库唯一约束——
--      conversations_direct_post_creator_unique_idx 这条唯一索引是按
--      (post_id, created_by) 建的，post_id 为 null 时 Postgres 不会把多行
--      NULL 视为冲突，没法用它防重复。这里用"先查后插"代替，理论上存在
--      并发下建出两条重复会话的极小概率窗口（跟这个项目里其它"客户端/
--      单次函数调用内先查后判断"的已接受简化是同一类风险，量级也类似：
--      两个人同一毫秒内对同一个活动做出报名/退出动作），这次不为这个
--      极小概率加分布式锁或额外的唯一索引设计。
--   2. 这类"post_id 为空"的会话在 /messages 会话列表页目前不会显示任何
--      标题（`listMyConversations` 联表读的是 posts(title)，这里没有
--      对应的 post 行）——会话内容本身（消息正文里带活动标题）依然完整，
--      只是列表页那一行的"关于 XXX"副标题会是空的。这属于消息系统目前
--      "会话主题只认 posts"这个既有耦合的自然结果，不是这份迁移引入的新
--      问题，这次任务范围（报名/退出发一条私信提醒）不要求改造会话列表
--      UI，所以没有顺带扩这个口子（比如加 activity_id 列 + 改
--      listMyConversations 的联表逻辑），留给以后如果这类"非帖子会话"
--      变多、确实需要在列表页区分主题时再做。

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

  -- "获取或创建"：找一条已有的、由当前操作者发起、对方是目标发起人、
  -- post_id 为空的 direct 会话，找到就复用，避免同一对用户之间反复报名/
  -- 退出不同活动时无限新建会话。找不到再新建（见文件头注释的取舍 1）。
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

revoke execute on function public.create_activity_conversation(uuid) from public;
grant execute on function public.create_activity_conversation(uuid) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.create_activity_conversation(uuid) from authenticated;
-- drop function if exists public.create_activity_conversation(uuid);
