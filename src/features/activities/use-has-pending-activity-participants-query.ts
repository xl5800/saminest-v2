import { useQuery } from "@tanstack/react-query";

import { countPendingActivityParticipantsForOrganizer } from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前用户名下所有活动的待处理报名申请数。两个调用方共用同一个
 * queryKey 和缓存条目：
 * - 底部导航"我的"图标红点（30 号卡）：useHasPendingActivityParticipantsQuery，
 *   用 select 转成"是否大于 0"；
 * - "我的"页面"我的活动"这一行的数量角标（审核入口红点任务卡）：
 *   usePendingActivityParticipantsCountQuery，直接拿数字。
 * queryKey 沿用原来的 "has-pending-activity-participants"——
 * my-activities-page.tsx 同意/拒绝申请后 invalidate 的就是这个 key，两处
 * 角标都会跟着刷新，不需要再加一处 invalidate。
 *
 * 跟 use-has-unread-system-notification-query.ts 是同一个模式：没有 realtime
 * 推送，兜底靠 React Query 默认的 refetchOnWindowFocus。
 */
function usePendingCountBaseQuery<T>(select: (count: number) => T) {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<number, Error, T>({
    queryKey: ["has-pending-activity-participants", userId],
    queryFn: () => countPendingActivityParticipantsForOrganizer(userId as string),
    enabled: !!userId,
    select
  });
}

const toHasPending = (count: number): boolean => count > 0;
const toCount = (count: number): number => count;

export function useHasPendingActivityParticipantsQuery() {
  return usePendingCountBaseQuery(toHasPending);
}

export function usePendingActivityParticipantsCountQuery() {
  return usePendingCountBaseQuery(toCount);
}
