import { useMutation, useQueryClient } from "@tanstack/react-query";

import { joinActivity, leaveActivity } from "../../repositories/activities-repository";

export interface ToggleActivityParticipationInput {
  activityId: string;
  userId: string;
  isCurrentlyJoined: boolean;
}

/**
 * 报名/退出的开关：根据调用方传入的当前报名状态决定调 joinActivity 还是
 * leaveActivity，跟 use-toggle-favorite-mutation.ts 是同一个模式。
 *
 * 不自己维护 participant_count（设计文档第 5 点要求），成功后只
 * invalidate 三个 queryKey，让页面重新拉取权威数据：
 * - ["activity-detail", activityId]：详情页头部的 participant_count 汇总
 *   数字由数据库触发器同步，要重新拉才能看到最新值。
 * - ["activity-participation", activityId, userId]：按钮自己"是否已报名"
 *   的状态。
 * - ["activities"]：列表页（前缀匹配，覆盖所有筛选条件组合）的
 *   participant_count/status（满员会从 open 变成 full）也可能变了。
 */
export function useToggleActivityParticipationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleActivityParticipationInput) => {
      if (input.isCurrentlyJoined) {
        await leaveActivity(input.activityId, input.userId);
      } else {
        await joinActivity(input.activityId, input.userId);
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["activity-detail", variables.activityId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["activity-participation", variables.activityId, variables.userId]
      });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    }
  });
}
