import { useMutation } from "@tanstack/react-query";

import { getOrCreateOwnSystemConversation } from "../../repositories/conversations-repository";

/**
 * 联系客服改成真聊天任务卡："联系客服"入口用。结构照抄
 * use-create-profile-conversation-mutation.ts（没有会话列表依赖这份
 * 数据、成功后不需要 invalidateQueries，不接受任何参数——目标会话固定
 * 是"我自己的" system 会话，调用方不需要、也不能传任何标识）。
 */
export function useGetOrCreateOwnSystemConversationMutation() {
  return useMutation({
    mutationFn: () => getOrCreateOwnSystemConversation()
  });
}
