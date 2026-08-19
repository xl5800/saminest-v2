import { useQuery } from "@tanstack/react-query";

import {
  listActivities,
  type ActivityListItem,
  type ListActivitiesInput
} from "../../repositories/activities-repository";

/**
 * 活动列表页（/activities）用。channel/stateCode 都进 queryKey——筛选条件
 * 变了要算一个新的缓存条目，跟 use-posts-query.ts 里 searchQuery/categoryId
 * 进 queryKey 是同一个原因。08 号卡：stateCode 取代原来的 locationId，见
 * activities-repository.ts 的 ListActivitiesInput 注释。
 */
export function useActivitiesQuery(input: ListActivitiesInput) {
  return useQuery<ActivityListItem[]>({
    queryKey: [
      "activities",
      { channel: input.channel ?? null, stateCode: input.stateCode ?? null }
    ],
    queryFn: () => listActivities(input)
  });
}
