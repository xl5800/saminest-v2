import { useQuery } from "@tanstack/react-query";

import {
  listActivityParticipantPreviews,
  type ActivityParticipant
} from "../../repositories/activities-repository";

/**
 * 活动列表页每张卡片头像堆叠要用的参与者预览，按 activityId 批量查
 * （见 listActivityParticipantPreviews）。activityIds 通常来自同一次
 * useActivitiesQuery 结果的 `.map(a => a.id)`——TanStack Query 对
 * queryKey 数组做深比较，不是引用比较，同一次渲染里数组内容/顺序稳定
 * 就不会触发误判的 refetch，调用方不需要自己 useMemo 稳定这个数组。
 *
 * enabled: activityIds.length > 0，跟 listActivityParticipantPreviews
 * 自己的空数组早退是同一个判断，避免 activities 还没加载出来时发一次
 * 注定查不到东西的请求。
 */
export function useActivityParticipantPreviewsQuery(activityIds: string[]) {
  return useQuery<Map<string, ActivityParticipant[]>>({
    queryKey: ["activity-participant-previews", activityIds],
    queryFn: () => listActivityParticipantPreviews(activityIds),
    enabled: activityIds.length > 0
  });
}
