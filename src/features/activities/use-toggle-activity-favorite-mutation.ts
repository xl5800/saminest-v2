import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  addActivityFavorite,
  removeActivityFavorite
} from "../../repositories/favorites-repository";

export interface ToggleActivityFavoriteInput {
  userId: string;
  activityId: string;
  isCurrentlyFavorited: boolean;
}

/**
 * 收藏/取消收藏活动的开关，跟 use-toggle-favorite-mutation.ts（帖子收藏）
 * 是同一个模式。成功后只让 ["activity-favorites", userId]（
 * ActivityFavoriteButton 用来判断是否已收藏的 id 列表）失效——这批任务
 * 明确不做"我的收藏"活动列表页（没有 listFavoritedActivities，也没有
 * 对应的 query key 需要跟着刷新）。
 */
export function useToggleActivityFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleActivityFavoriteInput) => {
      if (input.isCurrentlyFavorited) {
        await removeActivityFavorite({ userId: input.userId, activityId: input.activityId });
      } else {
        await addActivityFavorite({ userId: input.userId, activityId: input.activityId });
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["activity-favorites", variables.userId]
      });
    }
  });
}
