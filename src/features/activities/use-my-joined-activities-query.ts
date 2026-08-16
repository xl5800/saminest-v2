import { useQuery } from "@tanstack/react-query";

import {
  listMyJoinedActivities,
  type ActivityListItem
} from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * "我的活动"页面"我报名的" tab 用：当前登录用户当前仍报名的活动（包括
 * 活动被发起人取消的情况，见 listMyJoinedActivities 的注释）。没有登录
 * 用户时禁用查询，理由同 use-my-organized-activities-query.ts。
 */
export function useMyJoinedActivitiesQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<ActivityListItem[]>({
    queryKey: ["my-joined-activities", userId],
    queryFn: () => listMyJoinedActivities(userId as string),
    enabled: !!userId
  });
}
