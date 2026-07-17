import { useQuery } from "@tanstack/react-query";

import {
  listMyConversations,
  type ConversationListItem
} from "../../repositories/conversations-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户参与的所有会话，供 /messages 会话列表页使用。没有登录用户
 * 时禁用查询，不发请求、不报错——跟 useFavoritePostIdsQuery 是同一个idiom。
 *
 * 不设置 staleTime：跟 useMessagesQuery 一样，用全局默认值即可，这里没有
 * "数据几乎不变"的场景（新消息会改变 last_message_at，进而改变排序）。
 */
export function useMyConversationsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<ConversationListItem[]>({
    queryKey: ["conversations", userId],
    queryFn: () => listMyConversations(userId as string),
    enabled: !!userId
  });
}
