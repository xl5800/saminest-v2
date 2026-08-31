import { useQuery } from "@tanstack/react-query";

import { hasPendingActivityParticipantsForOrganizer } from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 底部导航"我的"图标待审核红点用（30 号卡）——跟
 * use-has-unread-system-notification-query.ts 是同一个模式：没有 realtime
 * 推送，兜底靠 React Query 默认的 refetchOnWindowFocus，用户切回 App 或
 * 从审核面板同意/拒绝完申请之后（那两个操作各自会 invalidate 这个
 * queryKey，见 my-activities-page.tsx）会重新拉取一次，不需要额外配置
 * 轮询间隔。
 */
export function useHasPendingActivityParticipantsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<boolean>({
    queryKey: ["has-pending-activity-participants", userId],
    queryFn: () => hasPendingActivityParticipantsForOrganizer(userId as string),
    enabled: !!userId
  });
}
