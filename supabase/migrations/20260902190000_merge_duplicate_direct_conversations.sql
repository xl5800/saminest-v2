-- Migration: 合并同一对用户之间的历史重复 direct 会话
--
-- 为什么改：
--   "同一对用户之间永远只应该有一条 direct 会话"这条规则本身已经在
--   20260825044820_unify_direct_conversation_lookup_and_reference_messages.sql
--   落地——get_or_create_direct_conversation()/find_direct_conversation_between()/
--   create_direct_conversation_row() 三个函数现在双向查找、不限
--   post/activity/profile 来源，新产生的联系不会再拆出新会话（这份迁移不
--   碰这三个函数，它们已经是对的）。但那份迁移只保证"这次调用之后新发生
--   的联系不会再拆出新会话"，明确没有回填/清理"改之前"就已经攒下的历史
--   重复会话——2026-08-25 之前，post/activity/profile 三种入口各自维护一份
--   不一致的查找逻辑（create_activity_conversation 只按 created_by =
--   当前操作者查找、不查对方发起的方向；create_direct_conversation 靠
--   (post_id, created_by) 部分唯一索引去重，换一个帖子就另开一条），同一对
--   用户之间因此可能已经留下好几条独立的 direct 会话。这份迁移就是把这些
--   历史遗留的重复会话合并成每对用户一条，纯数据清理，不改任何函数/RLS/
--   表结构。
--
-- 判定"重复"的范围（只处理这一种情况，不是任意两条会话都算重复）：
--   `conversations.type = 'direct' and deleted_at is null`，且这条会话
--   在 conversation_members 里 **恰好有 2 个不同的成员**——这个条件专门
--   排除了 origin_type = 'system' 那种"只有接收者一个成员"的系统通知会话
--   （见 20260818162648_add_system_notification_support.sql /
--   create_notify_user_function.sql）：那类会话 type 也是 'direct'，但
--   结构上不是"一对用户"，不属于这次要合并的对象，天然被"恰好 2 个成员"
--   这条件挡在外面，不需要额外按 origin_type 过滤。
--
-- 合并算法（严格按任务卡给定的步骤实现，不自行发明另一套）：
--   1. 把每条满足上面条件的会话，按它两个成员的 user_id 排出一个无序对
--      (user_a, user_b)（取 min/max，不用自连接，一次 group by 就能拿到）。
--   2. 同一对里，created_at 最早的一条是"幸存者"（并列时按 id 兜底排序，
--      保证结果确定性），其余是"待合并"。一个用户对只有一条会话时不会
--      产生任何"待合并"行，后续所有 UPDATE/DELETE 都以 pair_duplicates
--      这张临时表为驱动源，零匹配行时天然是空操作——这就是这份迁移的
--      幂等/无重复数据时不动一行的保证，不需要额外写 IF EXISTS 分支。
--   3. messages.conversation_id 批量重新指向幸存者，内容/发送者/时间戳
--      不变。
--   4. conversation_members：先把"待合并"会话（含幸存者自己）里同一个
--      user_id 的 last_read_at/left_at/is_muted 按任务卡给定的规则聚合，
--      写回幸存者本来就有的那一行；再删除"待合并"会话的
--      conversation_members 行——顺序上必须先聚合读数据、再删，不能颠倒。
--   5. 删除"待合并"的 conversations 行本身，必须在第 3、4 步（messages 已
--      经改指、conversation_members 已经清空）完成之后，否则会撞上
--      messages_conversation_id_fkey / conversation_members_conversation_id_fkey
--      两条外键（本仓库这两条外键同样没有写 on delete 子句，隐式
--      no action/no action，先删父行会直接报错）。
--   6. 幸存者的 last_message_at/last_message_preview/last_message_sender_id
--      三个缓存字段，合并消息之后必须重新按幸存者会话里真正最新的一条
--      messages 行算一遍，不能停留在合并前的旧值——sync_conversation_last_message_at()
--      触发器（20260828173506_add_conversation_last_message_sender.sql）
--      只在 `after insert on messages` 时触发，这里是 `update
--      messages.conversation_id`，不会触发它，所以这三列必须手动重算，
--      取值逻辑跟那个触发器逐字一致（coalesce(body, notification_payload
--      ->> 'summary', notification_payload ->> 'title') 当预览文案），不
--      发明新规则。
--
-- 是否影响现有数据：
--   有意地删除数据——这正是这份迁移的目的（历史重复会话本身就是脏数据）。
--   不会丢失任何一条消息（全部转移到幸存会话下，内容/发送者/时间戳不变），
--   也不会丢失任何一个用户对某条会话已读/免打扰状态里"更强"的那个值（见
--   上面第 4 步的合并规则）。用一对"3 条会话、同一对用户"的本地测试场景
--   验证过，见开发者本地记录，这里不重复贴。
--
-- 是否需要回滚方案：
--   不提供，也无法安全提供——这份迁移物理删除了 conversations/
--   conversation_members 行，删除之后原来的行号/多会话边界信息已经不
--   存在，没有办法在不重新引入历史重复数据的前提下"撤销"。如果确实需要
--   撤销，只能从合并前的数据库备份整体恢复，不是靠这份迁移文件反着跑
--   一遍能做到的，这里不假装提供一份看起来能跑但实际上无法正确复原的
--   "回滚 SQL"。
--
-- 幂等性：
--   任何环境（全新本地库、已经合并过一次的库、还没合并过的生产库）重复
--   执行这份迁移都是安全的——第二次执行时，上一次已经把每对用户合并到
--   只剩一条会话，conv_pair_info 里每个 (user_a, user_b) 分组只会剩一行，
--   pair_duplicates 因此是空表，后续所有 UPDATE/DELETE 语句都不会匹配到
--   任何行，不会报错，也不会产生任何数据变化。

-- =====================================================================
-- 1. 找出所有"type = direct、未软删除、恰好 2 个成员"的会话，
--    连同它们按 (user_a, user_b) 排好序的无序用户对。
-- =====================================================================
create temporary table conv_pair_info on commit drop as
select
  c.id as conversation_id,
  cmp.user_a,
  cmp.user_b,
  c.created_at
from public.conversations c
join (
  select
    conversation_id,
    -- min(uuid)/max(uuid) 不存在：PostgreSQL 内置聚合函数没有给 uuid 类型
    -- 注册 MIN/MAX（uuid 有 <  / > 比较运算符，ORDER BY 用它没问题，但
    -- 聚合函数是另一套独立的注册表，标准发行版里只给数值/字符串/日期时间
    -- 等类型注册了 min/max）。本地 `supabase db reset` 首次跑这份迁移时
    -- 就是在这一行报 `ERROR: function min(uuid) does not exist
    -- (SQLSTATE 42883)`，实测复现、不是猜测。uuid 转 text 之后按字典序
    -- 比较，跟 uuid 类型自己的 <  / > 运算符是同一个排序结果（canonical
    -- 文本表示本身就是按这个顺序生成的），转回 uuid 不会改变值，只是绕开
    -- "min/max 聚合函数没有 uuid 重载"这个限制，不影响排序结果的正确性。
    min(user_id::text)::uuid as user_a,
    max(user_id::text)::uuid as user_b,
    count(*) as member_count
  from public.conversation_members
  group by conversation_id
) cmp on cmp.conversation_id = c.id
where c.type = 'direct'
  and c.deleted_at is null
  and cmp.member_count = 2
  and cmp.user_a <> cmp.user_b;

-- =====================================================================
-- 2. 每一对用户，created_at 最早的一条是幸存者（并列按 id 兜底排序，
--    保证结果确定、可重复）。
-- =====================================================================
create temporary table pair_survivor on commit drop as
select distinct on (user_a, user_b)
  user_a,
  user_b,
  conversation_id as survivor_id
from conv_pair_info
order by user_a, user_b, created_at asc, conversation_id asc;

-- =====================================================================
-- 3. 同一对里除幸存者之外的其它会话——这张表是空的话，后面所有步骤
--    自动变成零匹配行的空操作，这就是幂等性/无重复数据时不动一行的
--    保证来源。
-- =====================================================================
create temporary table pair_duplicates on commit drop as
select
  cpi.conversation_id as duplicate_id,
  ps.survivor_id
from conv_pair_info cpi
join pair_survivor ps
  on ps.user_a = cpi.user_a and ps.user_b = cpi.user_b
where cpi.conversation_id <> ps.survivor_id;

-- =====================================================================
-- 4. messages 批量改指向幸存者会话——内容/发送者/时间戳/reply_to_id/
--    ref_post_id/ref_activity_id 等其它列原样不动，只改 conversation_id
--    这一列。
-- =====================================================================
update public.messages m
set conversation_id = pd.survivor_id
from pair_duplicates pd
where m.conversation_id = pd.duplicate_id;

-- =====================================================================
-- 5. conversation_members 合并：先聚合出每个 (survivor_id, user_id) 该有
--    的最终值，再写回幸存者本来就有的那一行，最后删除待合并会话的成员行。
--    只处理"确实有待合并会话"的那些用户对——没有重复的用户对完全不会
--    出现在这张临时表里，对应的 conversation_members 行不会被这次
--    UPDATE 碰到。
--
--    last_read_at：取更晚的那个值，null 视为最小——MAX() 聚合函数本身就
--    会跳过 NULL，只有当参与聚合的所有行都是 NULL 时才返回 NULL，这一条
--    内置行为跟"null 视为最小、有真实值就要那个真实值里最大的"要求逐字
--    对应，不需要额外写 CASE。
--
--    left_at：只要幸存者自己或任一待合并会话里这个用户是 NULL（代表"当时
--    没有离开过"），合并后就必须是 NULL，不能被其它会话里的历史退出时间
--    污染成"看起来已经退出"；只有全部非 NULL 时才取最大值（最晚的退出
--    时间）。
--
--    is_muted：只要任意一条是 true，合并后就是 true。
-- =====================================================================
create temporary table member_merge on commit drop as
select
  src.survivor_id,
  cm.user_id,
  max(cm.last_read_at) as merged_last_read_at,
  case
    when bool_or(cm.left_at is null) then null
    else max(cm.left_at)
  end as merged_left_at,
  bool_or(cm.is_muted) as merged_is_muted
from (
  select distinct survivor_id, survivor_id as conversation_id from pair_duplicates
  union all
  select survivor_id, duplicate_id as conversation_id from pair_duplicates
) src
join public.conversation_members cm on cm.conversation_id = src.conversation_id
group by src.survivor_id, cm.user_id;

update public.conversation_members cm
set last_read_at = mm.merged_last_read_at,
    left_at = mm.merged_left_at,
    is_muted = mm.merged_is_muted
from member_merge mm
where cm.conversation_id = mm.survivor_id
  and cm.user_id = mm.user_id;

delete from public.conversation_members cm
using pair_duplicates pd
where cm.conversation_id = pd.duplicate_id;

-- =====================================================================
-- 6. 删除待合并的 conversations 行本身——必须排在 messages/
--    conversation_members 都已经清空引用之后，避免撞上
--    messages_conversation_id_fkey / conversation_members_conversation_id_fkey
--    （两条外键都是隐式 on delete no action，先删父行会直接报错）。
-- =====================================================================
delete from public.conversations c
using pair_duplicates pd
where c.id = pd.duplicate_id;

-- =====================================================================
-- 7. 幸存者的 last_message_at/last_message_preview/last_message_sender_id
--    重新按合并后真正最新的一条 messages 行算一遍——sync_conversation_
--    last_message_at() 触发器只在 messages 的 INSERT 上触发，上面第 4
--    步是 UPDATE，不会被它感知到，这里手动补一次，取值口径跟那个触发器
--    （20260828173506_add_conversation_last_message_sender.sql）逐字一致。
--    只处理真的发生过合并的幸存者（distinct survivor_id from
--    pair_duplicates）——没有重复会话的用户对，它们的这三列本来就是
--    对的，不需要、也不应该被这一步碰到。
-- =====================================================================
update public.conversations c
set last_message_at = latest.created_at,
    last_message_preview = coalesce(
      latest.body,
      latest.notification_payload ->> 'summary',
      latest.notification_payload ->> 'title'
    ),
    last_message_sender_id = latest.sender_id
from (
  select distinct on (m.conversation_id)
    m.conversation_id,
    m.created_at,
    m.body,
    m.notification_payload,
    m.sender_id
  from public.messages m
  where m.conversation_id in (select distinct survivor_id from pair_duplicates)
  order by m.conversation_id, m.created_at desc
) latest
where c.id = latest.conversation_id;
