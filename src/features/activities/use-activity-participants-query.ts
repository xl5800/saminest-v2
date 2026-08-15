import { useQuery } from "@tanstack/react-query";

import {
  listActivityParticipants,
  type ActivityParticipant
} from "../../repositories/activities-repository";

/**
 * 活动详情页"参与者"区块用。不需要 enabled 之外的额外权限判断——RLS 已经
 * 按身份把可见范围收窄好了，页面只按"查到就展示、空数组就不展示"处理，
 * 见 activities-repository.ts 的 listActivityParticipants 顶部注释。
 */
export function useActivityParticipantsQuery(activityId: string) {
  return useQuery<ActivityParticipant[]>({
    queryKey: ["activity-participants", activityId],
    queryFn: () => listActivityParticipants(activityId),
    enabled: Boolean(activityId)
  });
}
