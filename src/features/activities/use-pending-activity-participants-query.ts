import { useQuery } from "@tanstack/react-query";

import {
  listPendingActivityParticipants,
  type PendingActivityParticipant
} from "../../repositories/activities-repository";

/**
 * "我的活动"页面"我发起的" tab 用：一次性查出当前用户名下所有
 * requires_approval 活动的待处理申请（不是每张卡片单独查一次，见
 * listPendingActivityParticipants 的注释）。activityIds 排序后拼成
 * queryKey 的一部分，保证同一批 id（不管数组元素顺序）命中同一个缓存条目，
 * 不会因为 organizedActivities 数组顺序变化就误判成"新的查询参数"而重新
 * 请求。
 */
export function usePendingActivityParticipantsQuery(activityIds: string[]) {
  const sortedKey = [...activityIds].sort().join(",");

  return useQuery<PendingActivityParticipant[]>({
    queryKey: ["activity-pending-participants", sortedKey],
    queryFn: () => listPendingActivityParticipants(activityIds),
    enabled: activityIds.length > 0
  });
}
