-- Migration: 紧急修正——去掉 conversations_select_member /
-- messages_select_of_own_conversations 两条策略里的管理员例外，修复
-- 管理员账号能看到别的用户系统通知会话的越权问题（同时修复"红点清不掉"）
--
-- 为什么改：
--   20260916120200_admin_support_conversations.sql（"联系客服改成真聊天"
--   任务卡）给这两条 SELECT 策略各加了一条
--   `or (deleted_at is null and origin_type = 'system' and is_admin())`
--   例外，本意是让 /admin/support 后台客服页面能看到所有用户的客服会话。
--   但这两条策略是这两张表唯一的行级读权限入口，普通用户"消息"tab 的
--   listMyConversations() 走的也是同一条 conversations_select_member
--   策略——这条例外因此对所有 role in ('admin','super_admin') 的账号
--   全局生效，不只是 /admin/support 页面。已经在生产库上核实过：账号
--   xlw0980@gmail.com（role = admin）自己的系统通知会话（只有一条"审核
--   通过"通知）之外，/messages 列表里还混进了另一个账号
--   （3209200633@qq.com）的系统通知会话——这是一次真实的越权数据泄漏，
--   不是理论风险。
--
--   这个例外从设计上就是多余的：admin_list_support_conversations() /
--   admin_reply_to_support_conversation() 这两个专门给 /admin/support
--   用的函数都是 security definer，Postgres 的 RLS 默认不对表的 owner
--   生效（这两张表当前没有开 force row level security），也就是说这两个
--   后台专用函数从一开始就是靠 is_admin() 内部校验 + security definer
--   直接绕过 RLS 拿到全部数据，根本不依赖这条 RLS 例外——加上之后唯一的
--   实际效果就是这次要修的越权 bug，删掉它不会影响 /admin/support 页面
--   的任何功能（本地验证已确认，见完工报告）。
--
--   这个越权还连带造成了"红点清不掉"的 UI 症状：清除未读要靠
--   conversation_members 表里"当前用户自己那一行"的 last_read_at（见
--   conversation-page.tsx 挂载时调用的 markConversationAsRead），但被
--   泄露进来的这条会话，管理员账号根本不是它的 conversation_members
--   成员——那条 UPDATE 语句实际影响 0 行，红点因此永远清不掉。这个症状
--   不需要单独修，是同一个越权的直接后果，去掉例外之后这条泄露的会话
--   不会再出现在管理员的列表里，红点问题自然一并消失。
--
-- 影响哪些表/函数：
--   重建 conversations_select_member（public.conversations）/
--   messages_select_of_own_conversations（public.messages）两条策略，
--   去掉 `or (... origin_type = 'system' and is_admin())` 这个分支，恢复
--   成 20260916120200 之前"只能看到自己是成员的会话/消息"这一条规则。
--   成员判断本身（is_conversation_member(id) / is_conversation_member
--   (conversation_id)）逐字不变，没有顺手改动这两条策略里跟这次问题
--   无关的其它部分。
--
--   不改 admin_list_support_conversations() / admin_reply_to_support_
--   conversation()、is_admin() 这三个函数本身——它们不依赖这条 RLS
--   例外（见上面的说明），本地已验证去掉例外之后 /admin/support 后台
--   页面的两个入口继续正常工作。
--
-- 是否影响现有数据：
--   不影响任何现有行，只收回一个从一开始就不该放开、且已经证实被滥用的
--   读权限范围。管理员因此不再能通过普通的"消息"tab 看到别人的系统通知
--   会话——这正是这次要恢复的正确行为，不是意外副作用。
--
-- 是否需要回滚方案：
--   不需要——收回一个已经证实存在越权的权限范围，没有"回滚回泄漏状态"
--   的理由，跟 20260914051412_fix_activity_moderation_anon_execute_leak.sql/
--   20260818163106_fix_notify_user_anon_execute_leak.sql 这两次权限收紧
--   修正是同一个处理方式。如果以后确实需要给 /admin/support 页面一个
--   RLS 层面的读取路径（目前不需要，那两个 security definer 函数已经
--   足够），应该另开一份新迁移重新评估范围，不是简单地把这份迁移的改动
--   倒过来。
--
-- 生产环境影响：这个越权从 20260916120200 上线那一刻起就存在，如果生产
-- 库已经应用过那份迁移，同样的越权（以及"红点清不掉"的连带症状）在生产
-- 环境这段时间里一直是可复现的，这份修正迁移需要尽快同步应用到生产库
-- ——这一步需要人工确认后单独执行，本次改动只提交这份迁移文件，不代表
-- 已经操作过生产环境。

-- =====================================================================
-- conversations_select_member：去掉管理员例外
-- =====================================================================

drop policy if exists conversations_select_member on public.conversations;

create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (deleted_at is null and is_conversation_member(id));

-- =====================================================================
-- messages_select_of_own_conversations：去掉管理员例外
-- =====================================================================

drop policy if exists messages_select_of_own_conversations on public.messages;

create policy messages_select_of_own_conversations
  on public.messages
  for select
  to authenticated
  using (is_conversation_member(conversation_id));
