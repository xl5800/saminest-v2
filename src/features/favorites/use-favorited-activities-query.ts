import { useQuery } from "@tanstack/react-query";

import {
  listFavoritedActivities,
  type ActivityListItem
} from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";

/** "我的收藏"页面"找搭子"标签：收藏过的活动（收藏列表补全任务卡）。 */
export function useFavoritedActivitiesQuery(enabled = true) {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<ActivityListItem[]>({
    queryKey: ["favorited-activities", userId],
    queryFn: () => listFavoritedActivities(userId as string),
    enabled: enabled && !!userId
  });
}
