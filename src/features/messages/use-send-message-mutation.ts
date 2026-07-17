import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sendMessage } from "../../repositories/messages-repository";

export interface SendMessageMutationInput {
  senderId: string;
  body: string;
}

/**
 * 发送一条消息。成功后让 ["messages", conversationId] 查询失效，
 * 页面会自动重新拉取最新的消息列表——这一轮没有 Realtime 订阅，"发送后
 * 立即刷新一次"就是产品要求的"手动刷新等效"方案（见任务范围说明）。
 */
export function useSendMessageMutation(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendMessageMutationInput) =>
      sendMessage({ conversationId, senderId: input.senderId, body: input.body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId]
      });
    }
  });
}
