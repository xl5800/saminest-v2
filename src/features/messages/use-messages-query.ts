import { useQuery } from "@tanstack/react-query";

import { listMessages, type MessageListItem } from "../../repositories/messages-repository";

/**
 * 某个会话的消息列表。这一轮没有 Realtime 订阅（见任务范围说明），发消息
 * 之后靠 useSendMessageMutation 的 onSuccess invalidate 这个 queryKey 来
 * 刷新，所以这里不设置长 staleTime——跟 use-posts-query.ts 一样，不设置就
 * 用全局默认值，保证手动 invalidate 之后一定会重新请求，不会因为"还没过期"
 * 被跳过。
 */
export function useMessagesQuery(conversationId: string) {
  return useQuery<MessageListItem[]>({
    queryKey: ["messages", conversationId],
    queryFn: () => listMessages(conversationId),
    enabled: !!conversationId
  });
}
