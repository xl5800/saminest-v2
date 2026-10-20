import { useMemo } from "react";

import { useAuthStore } from "../../store/auth-store";
import { useMyBlockedUsersQuery } from "./use-my-blocked-users-query";

const EMPTY = new Set<string>();

/**
 * 苹果审核 1.2 整改：我屏蔽了的用户 id。列表页（帖子、社区帖子、评论、活动）
 * 用它把这些人发的内容过滤掉。没登录 / 还没查回来时是空集合——内容照常显示，
 * 不会因为这个查询卡住列表。跟"已屏蔽"管理页共用同一个查询缓存，屏蔽 / 取消
 * 屏蔽后自动更新。
 */
export function useBlockedUserIds(): ReadonlySet<string> {
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data } = useMyBlockedUsersQuery(userId);

  return useMemo(
    () => (data && data.length > 0 ? new Set(data.map((item) => item.blockedUserId)) : EMPTY),
    [data]
  );
}
