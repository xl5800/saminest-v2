import { useMutation } from "@tanstack/react-query";

import { createDirectConversation } from "../../repositories/conversations-repository";

/**
 * 创建（或获取已有的）与帖子发布者之间的私聊会话。这一轮没有"会话列表"
 * 之类依赖这份数据的 UI（见任务范围说明），提交成功后没有需要失效的查询，
 * 所以不像 useToggleFavoriteMutation 那样在 onSuccess 里 invalidateQueries。
 */
export function useCreateDirectConversationMutation() {
  return useMutation({
    mutationFn: (postId: string) => createDirectConversation(postId)
  });
}
