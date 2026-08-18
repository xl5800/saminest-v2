import { useQuery } from "@tanstack/react-query";

import { hasUnreadSystemNotification } from "../../repositories/conversations-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 底部导航"消息"图标未读红点用。这个查询没有 realtime 推送，兜底靠
 * React Query 默认的 refetchOnWindowFocus，用户切回 App 时能刷新一次，
 * 不需要额外配置轮询间隔——这次不做真正的实时推送。
 */
export function useHasUnreadSystemNotificationQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<boolean>({
    queryKey: ["has-unread-system-notification", userId],
    queryFn: () => hasUnreadSystemNotification(userId as string),
    enabled: !!userId
  });
}
