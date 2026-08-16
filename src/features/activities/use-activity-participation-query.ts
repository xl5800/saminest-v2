import { useQuery } from "@tanstack/react-query";

import {
  getActivityParticipationStatus,
  type ActivityParticipationStatus
} from "../../repositories/activities-repository";

/**
 * 当前登录用户对这场活动的报名状态——只有 ActivityParticipationButton 用，
 * 决定按钮显示"我要报名"/"申请加入"/"申请中"/"退出活动"/"申请已被拒绝"
 * 中的哪一种（P2 报名审核制上线后，从单纯的布尔"是否已报名"扩成四态，见
 * activities-repository.ts 的 getActivityParticipationStatus 注释）。
 * 未登录（userId 为 undefined）时禁用查询，跟 use-my-profile-query.ts 的
 * enabled 写法是同一个模式，这里的 enabled 只是防御性的，这个 hook 目前
 * 只在已经判断过 userId 存在的分支里才会被实际用到其结果。
 */
export function useActivityParticipationQuery(activityId: string, userId: string | undefined) {
  return useQuery<ActivityParticipationStatus>({
    queryKey: ["activity-participation", activityId, userId],
    queryFn: () => getActivityParticipationStatus(activityId, userId as string),
    enabled: Boolean(userId)
  });
}
