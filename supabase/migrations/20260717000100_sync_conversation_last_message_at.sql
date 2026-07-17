-- Migration: sync conversations.last_message_at from new messages
--
-- 为什么改：
--   会话列表页需要按"最后一条消息的时间"排序，但
--   supabase/migrations/20260716000400_create_messaging_tables.sql 建表时
--   明确指出 conversations.last_message_at 没有任何自动同步机制，只是把
--   字段按文档建了出来。现在要做会话列表页，补上这个同步逻辑。
--
-- 影响哪些表：
--   不新建表，只新增一个 security definer 触发器函数，绑定在
--   public.messages 的 AFTER INSERT 上，用来更新
--   public.conversations.last_message_at。
--
-- 是否影响现有数据：
--   这个触发器只对"以后新插入的 messages 行"生效，不会回填已经存在的
--   历史消息对应的 last_message_at（现在数据库里已有的几条测试消息不会
--   被这次迁移影响，它们对应会话的 last_message_at 会保持 null，直到那些
--   会话里有新消息插入才会第一次被同步）。如果需要把历史数据也补齐，
--   需要额外单独跑一次数据回填，不在这份迁移范围内。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 实现思路（跟 favorites 触发器同步 posts.favorite_count 是同一个模式，
-- 见 supabase/migrations/20260716000200_create_favorites_table.sql 里的
-- sync_post_favorite_count）：
--   conversations 表本来就没有开放任何 UPDATE 策略给普通用户（见
--   20260716000400 迁移的注释：conversations 的 RLS 范围只给了 SELECT，
--   没有 UPDATE/DELETE），所以这次不需要新增或修改任何 RLS 策略——
--   触发器函数用 security definer，属主天然拥有 conversations 表、
--   绕过它自身的 RLS（没有 UPDATE 策略也无所谓，owner 身份不受策略限制），
--   这样就能在"没有任何角色能直接 UPDATE conversations"的前提下，
--   仍然让这一个触发器把 last_message_at 更新成最新消息的 created_at——
--   跟 favorite_count 的思路完全一致：只有触发器能改这个字段。
create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

create trigger messages_after_insert_sync_conversation_last_message_at
  after insert on public.messages
  for each row
  execute function public.sync_conversation_last_message_at();

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop trigger if exists messages_after_insert_sync_conversation_last_message_at on public.messages;
-- drop function if exists public.sync_conversation_last_message_at();
