import { useMutation } from "@tanstack/react-query";

import { getOrCreateOwnSupportConversation } from "../../repositories/conversations-repository";

/**
 * 把"联系客服"拆成独立会话类型任务卡："联系客服"入口用。结构照抄
 * use-get-or-create-own-system-conversation-mutation.ts（没有会话列表
 * 依赖这份数据、成功后不需要 invalidateQueries，不接受任何参数——目标
 * 会话固定是"我自己的" support 会话，调用方不需要、也不能传任何标识）。
 */
export function useGetOrCreateOwnSupportConversationMutation() {
  return useMutation({
    mutationFn: () => getOrCreateOwnSupportConversation()
  });
}
