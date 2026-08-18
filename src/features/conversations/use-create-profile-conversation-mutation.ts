import { useMutation } from "@tanstack/react-query";

import { createProfileConversation } from "../../repositories/conversations-repository";

/**
 * 公开个人主页"发消息"按钮用。结构照抄
 * use-create-direct-conversation-mutation.ts（同样没有会话列表依赖这份
 * 数据、成功后不需要 invalidateQueries）——两者的差别只在调用的仓库函数
 * 不同（这里是不绑定帖子/活动、可以对任意用户发起的 createProfileConversation，
 * 带每日限流），mutation hook 本身的结构没有理由写得不一样。
 */
export function useCreateProfileConversationMutation() {
  return useMutation({
    mutationFn: (targetUserId: string) => createProfileConversation(targetUserId)
  });
}
