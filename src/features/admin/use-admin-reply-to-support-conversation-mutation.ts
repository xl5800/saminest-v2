import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminReplyToSupportConversation } from "../../repositories/messages-repository";

export interface AdminReplyToSupportConversationInput {
  conversationId: string;
  body: string | null;
  imagePath: string | null;
}

/**
 * 联系客服改成真聊天任务卡：管理员在 /admin/support/:conversationId
 * 回复用户。成功后 invalidate 两个 queryKey：
 * - ["messages", conversationId]：这条会话的消息列表，管理员自己的详情
 *   页要立刻看到刚发的这条回复。
 * - ["admin", "support-conversations"]：客服会话列表，回复会改变这条
 *   会话的 last_message_at/last_message_preview，列表排序/预览文字要
 *   跟着刷新（不依赖管理员手动返回列表页再重新进来才看到最新状态）。
 */
export function useAdminReplyToSupportConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminReplyToSupportConversationInput) =>
      adminReplyToSupportConversation(input.conversationId, input.body, input.imagePath),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["messages", variables.conversationId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "support-conversations"]
      });
    }
  });
}
