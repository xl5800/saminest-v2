-- Migration: 系统通知支持——conversations.origin_type 加 'system'，
-- messages 支持无发送者的结构化通知消息
--
-- 为什么改：
--   "系统通知"（帖子审核结果、账号状态变更等，见任务讨论）复用现有的
--   conversations/messages 表，而不是新建一张独立的 notifications 表——
--   这样能直接复用现有的会话列表/详情页 UI 和 RLS，不用新起一套。但系统
--   通知跟现有三种会话来源（post/activity/profile）有两个本质不同，需要
--   放开对应的表结构限制：
--     1. 系统通知不是任何真实用户发的，之前"要不要为此建一个虚拟系统
--        账号"评估过——profiles.id 是 auth.users(id) 的外键，建虚拟账号
--        意味着要在 auth.users 里插一行不经过 GoTrue 正常注册流程的记录，
--        风险和维护成本都不小。改成更干净的方式：messages.sender_id 放开
--        为可空，null 就代表"这条消息是系统发的"，不需要任何虚拟 profiles/
--        auth.users 行。
--     2. 系统通知这类会话只有"接收者"一个成员，没有"对方"——不像
--        post/activity/profile 这三种都是两个真实用户的 1:1 会话。
--        conversations/conversation_members 的表结构本身没有"必须两个
--        成员"这条约束（这条约束只是所有现有创建入口的应用层惯例），
--        这次系统通知的会话只插一条 conversation_members 行（接收者
--        自己），不需要改表结构。
--
-- 影响哪些表：
--   public.conversations：origin_type 的 check 约束加一个新取值 'system'。
--   public.messages：sender_id 列从 not null 改成可空；新增
--   notification_payload jsonb 列，只有系统通知消息才会填这一列（结构化
--   的 {title, summary, link}，供前端渲染成卡片，而不是聊天气泡）；加一条
--   新的 check 约束，保证"sender_id 和 notification_payload 至少有一个不是
--   null"——不允许插入一条既不是任何人发的、又没有通知内容的空消息。
--
-- 是否影响现有数据：
--   不影响现有行——sender_id 放开可空不会让已有的非空值变成空；
--   notification_payload 新增列默认 null，历史消息都不受影响；新加的
--   check 约束对历史数据天然满足（历史消息 sender_id 都不为空）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.conversations
  drop constraint conversations_origin_type_check;

alter table public.conversations
  add constraint conversations_origin_type_check
    check (origin_type in ('post', 'activity', 'profile', 'system'));

alter table public.messages
  alter column sender_id drop not null;

alter table public.messages
  add column notification_payload jsonb null default null;

comment on column public.messages.notification_payload is
  '系统通知消息才会填这一列，结构化内容 {title, summary, link}，供前端渲染成卡片（图标+标题+摘要+可选跳转链接），不是聊天气泡。sender_id 为 null 时这一列必须有值，反过来 sender_id 不为 null 时这一列必须是 null——见 messages_sender_or_notification_check。';

alter table public.messages
  add constraint messages_sender_or_notification_check
    check (
      (sender_id is not null and notification_payload is null)
      or
      (sender_id is null and notification_payload is not null)
    );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.messages drop constraint messages_sender_or_notification_check;
-- alter table public.messages drop column notification_payload;
-- alter table public.messages alter column sender_id set not null;
-- alter table public.conversations drop constraint conversations_origin_type_check;
-- alter table public.conversations add constraint conversations_origin_type_check
--   check (origin_type in ('post', 'activity', 'profile'));
