import { useQuery } from "@tanstack/react-query";

import {
  type AdminSupportConversationListItem,
  listSupportConversationsForAdmin
} from "../../repositories/conversations-repository";

/**
 * 联系客服改成真聊天任务卡：管理员客服会话列表（/admin/support）。跟
 * use-admin-feedback-query.ts 是同一个结构——这里没有"标记状态后本地移除
 * 一行"这种需要，管理员回复之后这条会话还应该继续留在列表里（只是排序
 * 会因为 last_message_at 更新而变化），所以不需要额外的本地 state，
 * 单纯依赖这个 query 的数据渲染。
 */
export function useAdminSupportConversationsQuery() {
  return useQuery<AdminSupportConversationListItem[]>({
    queryKey: ["admin", "support-conversations"],
    queryFn: () => listSupportConversationsForAdmin()
  });
}
