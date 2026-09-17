import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sendMessage } from "../../repositories/messages-repository";

export interface SendMessageMutationInput {
  senderId: string;
  /** 联系客服改成真聊天任务卡：改成可选——一条消息可以只有图片没有文字，
   *  见 messages-repository.ts SendMessageInput.body 的注释。 */
  body?: string;
  /** 联系客服改成真聊天任务卡新增：可选，conversation-page.tsx 上传完
   *  图片之后传这个字段的 Storage 路径进来。 */
  imagePath?: string;
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
      sendMessage({
        conversationId,
        senderId: input.senderId,
        body: input.body,
        imagePath: input.imagePath
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId]
      });
    }
  });
}
