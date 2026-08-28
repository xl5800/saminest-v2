-- Migration: 会话未读判断需要知道"最后一条消息是谁发的"——20 号卡修复
--   "自己发的消息不该点亮自己的未读红点"这个 bug
--
-- 为什么改：
--   现有 computeIsUnread()（src/repositories/conversations-repository.ts）
--   在这次改动之前只比较 conversations.last_message_at 和当前用户自己的
--   conversation_members.last_read_at 两个时间戳，完全不知道最后一条
--   消息是谁发的——导致用户 A 主动发消息给 B 时，last_message_at 会更新，
--   但 A 自己的 last_read_at 只在"打开会话页那一刻"更新过（见
--   conversation-page.tsx 挂载时调用的 markConversationAsRead），不会
--   随着"我刚发的这条消息"同步推进，于是 A 自己也会被判定成"未读"，
--   在会话列表里看到自己刚发出去的消息带着红点。要修复这个判断，前端
--   需要知道"最后一条消息的发送者是谁"，现有 schema 里这个信息缺失——
--   sender_id 只存在于逐条 messages 行上，conversations 表没有任何列
--   能免关联查询直接拿到"最新一条消息是谁发的"。
--
-- 影响哪些表：
--   public.conversations：新增 last_message_sender_id 列。
--   sync_conversation_last_message_at() 触发器函数：顺带维护这一列——跟
--   20260818182645 迁移给这个触发器加 last_message_preview 是同一个
--   "同一次 AFTER INSERT，多维护一列，不新增触发器"的模式，不新建触发器。
--
-- 是否影响现有数据：
--   新增列默认 null，历史行不受影响；下面单独跑一次回填，回填逻辑跟
--   20260818182645 迁移回填 last_message_preview 完全对称（同一个
--   "按 created_at 取每个会话最新一条消息"子查询、同一批目标行），只是
--   这次取 sender_id 而不是 body/summary。系统通知消息的 sender_id 本来
--   就是 null（20260818162648 迁移放开的），回填/触发器都会如实把 null
--   写进 last_message_sender_id——这正是期望行为：系统通知永远不会被
--   判定成"是当前用户自己发的"，不会因为这次改动意外抑制掉系统通知的
--   未读红点，见 computeIsUnread() 顶部注释。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 20 号卡范围说明：这份迁移只新增列 + 维护它的触发器，不改任何 RLS——
--   conversations 表本来就没有开放任何角色的 UPDATE 策略（见
--   20260716000400 迁移），这一列同 last_message_at/last_message_preview
--   一样只能靠这个 security definer 触发器写入，不需要新策略。前端读取
--   这一列走的是 conversations 表现有的 SELECT 策略
--   （conversations_select_member），同样不需要改。
--
-- 上线流程提醒（写在这里方便审阅时一眼看到）：这份迁移文件只是写好、
-- 还没有 apply 到任何远程/生产环境——按约定，数据库改动需要人工确认过
-- 内容之后再统一走上线流程，本地开发/本地 Supabase 环境不受这条限制。
--
-- 外键删除行为核对（提交前专门查过一遍，不是假设）：messages.sender_id
-- 那条外键（messages_sender_id_fkey，20260716000400 迁移建表时就是这样，
-- 之后从没改过）没有写任何 on delete 子句，是 Postgres 的隐式默认值
-- ——on delete no action、on update no action，不是 cascade，也不是
-- set null；用 pg_get_constraintdef 在线上库核对过，打印结果同样不带任何
-- on delete/on update 子句，确认线上就是这个默认行为。真正让这条外键
-- 从来不会在正常业务流程里被触发的，不是这条约束本身，而是更上层的
-- 设计：20260822000000_account_self_deletion.sql 的
-- purge_expired_account_deletions() 明确选择了"profiles 这一行永远不物理
-- 删除、也不设置 deleted_at，只原地把 display_name/avatar_url/bio/
-- location_id 匿名化 + account_status 改成 'deleted'"——那份迁移的注释原话
-- 是"posts.author_id 等外键最终都追溯到 profiles.id（无 on delete cascade/
-- set null），物理删掉 profiles 这一行会直接报外键错误"，sender_id 是同一
-- 类外键，同一个道理。也就是说 messages.sender_id 之所以"删账号不会报错"，
-- 是因为账号注销从来不会走到"删 profiles 这一行"这一步，不是这条外键自己
-- 有什么特殊处理。
--
-- 下面 last_message_sender_id 的外键必须跟 sender_id 完全一致——同样不写
-- on delete/on update 子句，同样是隐式 no action/no action，不能因为这一列
-- 是"冗余镜像列"就顺手给它加 on delete set null/cascade 这类看起来更"安全"
-- 的写法：那样反而会制造一个新的不一致——账号注销时 messages.sender_id
-- 继续指向那个已匿名化的 profiles 行（依旧显示"已注销用户"），但
-- last_message_sender_id 如果是 set null，会话列表最后一条消息的发送者
-- 信息反而会被清空，跟 messages 表里那条消息本身的 sender_id 对不上，
-- 复现不出"最后一条消息不是自己发的"这个未读判断依赖的数据。这里保持
-- 隐式默认（不写 on delete/on update），就是保证跟 sender_id 逐字一致。
alter table public.conversations
  add column last_message_sender_id uuid null default null references public.profiles (id);

comment on column public.conversations.last_message_sender_id is
  '最后一条消息的发送者，跟 messages.sender_id 同步——系统通知消息（sender_id 为 null）这里也是 null。会话列表未读判断（"最后一条消息不是自己发的，且自己没读过"）需要这一列，见 conversations-repository.ts 的 computeIsUnread()。';

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
      ),
      last_message_sender_id = new.sender_id
  where id = new.conversation_id;

  return new;
end;
$$;

-- 回填存量会话：跟 20260818182645 迁移回填 last_message_preview 用同一个
-- "按 created_at 取每个会话最新一条消息"子查询，只是这次取 sender_id。
update public.conversations c
set last_message_sender_id = (
  select msg.sender_id
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
--   set last_message_at = new.created_at,
--       last_message_preview = coalesce(
--         new.body,
--         new.notification_payload ->> 'summary',
--         new.notification_payload ->> 'title'
--       )
--   where id = new.conversation_id;
--
--   return new;
-- end;
-- $$;
--
-- alter table public.conversations drop column last_message_sender_id;
