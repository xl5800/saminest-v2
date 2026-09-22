import { useQuery } from "@tanstack/react-query";

import {
  adminListSupportConversationMessages,
  type MessageListItem
} from "../../repositories/messages-repository";

/**
 * 修复管理员客服会话详情页读不到消息内容的 RLS 缺口任务卡：管理员在
 * /admin/support/:conversationId 读某个客服会话的消息列表，走
 * admin_list_support_conversation_messages() 这个 security definer
 * 函数（绕过 messages 表自己的 RLS，管理员不是会话成员，走常规查询会被
 * 静默过滤成 0 行）。
 *
 * queryKey 故意跟 useMessagesQuery() 用同一个 ["messages", conversationId]，
 * 不另起一个——useAdminReplyToSupportConversationMutation() 成功后
 * invalidate 的就是这个 key，管理员发送回复后详情页要立刻刷新看到自己
 * 刚发的这条，用同一个 key 那条现有的 invalidate 逻辑不用改就能继续
 * 生效。
 */
export function useAdminSupportConversationMessagesQuery(conversationId: string) {
  return useQuery<MessageListItem[]>({
    queryKey: ["messages", conversationId],
    queryFn: () => adminListSupportConversationMessages(conversationId),
    enabled: !!conversationId
  });
}
