import { useMutation } from "@tanstack/react-query";

import { createActivityConversation } from "../../repositories/conversations-repository";

/**
 * 创建（或获取已有的）与活动发起人之间的私聊会话——活动详情页"联系发起人"
 * 按钮用（任务卡 3）。
 *
 * 结构照抄 use-create-direct-conversation-mutation.ts（帖子那一套，
 * ContactSellerButton/"咨询"按钮背后用的 useCreateDirectConversationMutation），
 * 这里只是给同一种"一次 mutate 调用 → 拿会话 id → 跳转"模式换成活动场景。
 *
 * 注意：conversations-repository.ts 里的 createActivityConversation(activityId)
 * 本身在这次任务之前就已经存在（"一起去"报名/退出通知发起人那一步，见
 * use-toggle-activity-participation-mutation.ts 的 notifyOrganizer 早就在
 * 调用它），不是这次任务卡新增的仓库函数——这里新增的只是这一层
 * useMutation 包装（供"联系发起人"这个新的用户可点入口使用，跟
 * notifyOrganizer 那种"操作成功后的副作用调用"是两个不同的调用场景，各自
 * 需要的 loading/error UI 状态也不同，所以单独包一层，不是重复实现）。
 *
 * 这一轮没有依赖这份数据的会话列表 UI 需要失效，提交成功后不需要
 * invalidateQueries，跟 useCreateDirectConversationMutation 是同一个理由。
 */
export function useCreateActivityConversationMutation() {
  return useMutation({
    mutationFn: (activityId: string) => createActivityConversation(activityId)
  });
}
