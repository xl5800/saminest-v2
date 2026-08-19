import { useQuery } from "@tanstack/react-query";

import {
  listOrganizerActivities,
  type ActivityListItem
} from "../../repositories/activities-repository";

/**
 * 发起者主页（/users/:userId）"TA 发起的搭子"区块用，见
 * listOrganizerActivities 顶部注释——这里查的是"这个 userId 发起的公开
 * 活动"，跟 use-activities-query.ts（列表页，不按 organizer 过滤）和
 * my-activities-page.tsx 用的"我发起的"（只能查自己）都是不同的查询函数，
 * 不要混用。
 */
export function useOrganizerActivitiesQuery(organizerId: string) {
  return useQuery<ActivityListItem[]>({
    queryKey: ["organizer-activities", organizerId],
    queryFn: () => listOrganizerActivities(organizerId),
    enabled: organizerId.length > 0
  });
}
