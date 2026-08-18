-- 会话列表"最后一条消息预览"用。之前的 sync_conversation_last_message_at()
-- 只维护 last_message_at，这次顺带扩展它一并维护预览文字，不新增一个
-- 单独触发器——两者都是"每次插入消息后要更新 conversations 的一列"，同一个
-- AFTER INSERT 时机，没有理由拆成两个触发器。
--
-- 预览文字来源：普通消息用 messages.body；系统通知消息（sender_id 为空，
-- 走 notification_payload）优先用 payload 里的 summary，没有 summary 就退到
-- title——跟 conversation-page.tsx 的 SystemNotificationCard 展示逻辑保持
-- 一致（都是"summary 优先，没有就用 title"）。理论上 body 和
-- notification_payload 不会同时非空（messages_sender_or_notification_check
-- 这条 check 约束已经保证了互斥），所以 coalesce 顺序不会出现"该显示
-- notification 却被 body 抢先"的情况。
alter table public.conversations
  add column last_message_preview text null;

create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = coalesce(
        new.body,
        new.notification_payload ->> 'summary',
        new.notification_payload ->> 'title'
      )
  where id = new.conversation_id;

  return new;
end;
$$;

-- 回填存量会话：相关子查询按 created_at 取每个会话最新一条消息，套用跟
-- 触发器一样的 coalesce 顺序。只回填本来就有过消息的会话（last_message_at
-- 不为空），没有消息的会话维持 null，跟触发器语义一致（没消息就没预览）。
update public.conversations c
set last_message_preview = (
  select coalesce(msg.body, msg.notification_payload ->> 'summary', msg.notification_payload ->> 'title')
  from public.messages msg
  where msg.conversation_id = c.id
  order by msg.created_at desc
  limit 1
)
where c.last_message_at is not null;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- create or replace function public.sync_conversation_last_message_at()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $$
-- begin
--   update public.conversations
--   set last_message_at = new.created_at
--   where id = new.conversation_id;
--
--   return new;
-- end;
-- $$;
--
-- alter table public.conversations drop column last_message_preview;
