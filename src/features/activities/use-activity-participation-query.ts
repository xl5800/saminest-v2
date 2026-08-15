import { useQuery } from "@tanstack/react-query";

import { isCurrentlyJoined } from "../../repositories/activities-repository";

/**
 * 当前登录用户是否正在报名这场活动——只有 ActivityParticipationButton 用，
 * 决定按钮显示"报名"还是"退出"。未登录（userId 为 undefined）时禁用查询，
 * 跟 use-my-profile-query.ts 的 enabled 写法是同一个模式，这里的 enabled
 * 只是防御性的，这个 hook 目前只在已经判断过 userId 存在的分支里才会被
 * 实际用到其结果。
 */
export function useActivityParticipationQuery(activityId: string, userId: string | undefined) {
  return useQuery<boolean>({
    queryKey: ["activity-participation", activityId, userId],
    queryFn: () => isCurrentlyJoined(activityId, userId as string),
    enabled: Boolean(userId)
  });
}
