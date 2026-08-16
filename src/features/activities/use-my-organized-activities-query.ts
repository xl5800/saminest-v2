import { useQuery } from "@tanstack/react-query";

import {
  listMyOrganizedActivities,
  type ActivityListItem
} from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * "我的活动"页面（/my-activities）"我发起的" tab 用：当前登录用户作为
 * 发起人的全部活动。没有登录用户时禁用查询——这个 hook 只会在
 * /my-activities 页面使用，该路由已经被 RequireAuth 包裹，这里的 enabled
 * 只是防御性的，不承担鉴权职责（跟 use-my-posts-query.ts 是同一个模式）。
 */
export function useMyOrganizedActivitiesQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<ActivityListItem[]>({
    queryKey: ["my-organized-activities", userId],
    queryFn: () => listMyOrganizedActivities(userId as string),
    enabled: !!userId
  });
}
