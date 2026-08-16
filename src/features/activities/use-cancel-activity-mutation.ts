import { useMutation } from "@tanstack/react-query";

import { cancelActivity } from "../../repositories/activities-repository";

/**
 * 发起人取消自己的活动。不 invalidateQueries——跟 use-archive-post-mutation.ts
 * 同一个模式，my-activities-page.tsx 在 mutateAsync 成功后自己把这一行
 * 本地状态改成 'cancelled'，不依赖重新 fetch 来更新 UI。
 */
export function useCancelActivityMutation() {
  return useMutation({
    mutationFn: (activityId: string) => cancelActivity(activityId)
  });
}
