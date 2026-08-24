import { useQuery } from "@tanstack/react-query";

import { listMyBlockedUsers } from "../../repositories/user-blocks-repository";

/**
 * "我屏蔽的全部用户"列表——blocked-users-page.tsx（"我的"页新增的"已屏蔽"
 * 管理入口）用。currentUserId 缺失时禁用查询（未登录），跟这个目录里其它
 * 几个 hook 的 enabled 判断是同一个理由。queryKey 用 ["my-blocked-users",
 * currentUserId]（不是 ["is-blocking", ...]那一组——那组 key 是"某一对
 * 用户之间的关系"，这个是"我的全部列表"，两者是不同形状的数据，不应该
 * 共用同一个 queryKey 前缀，否则 invalidateQueries 时容易互相误伤）。
 *
 * 取消屏蔽成功后靠 use-unblock-user-mutation.ts 里已有的
 * invalidateQueries（queryKey: ["is-blocking", blockerId, blockedId]）
 * 并不会失效这个列表的缓存——两者是不同的 queryKey，blocked-users-page.tsx
 * 需要自己在取消屏蔽成功后额外 invalidate 这个 key，见该页面的注释。
 */
export function useMyBlockedUsersQuery(currentUserId: string | undefined) {
  return useQuery({
    queryKey: ["my-blocked-users", currentUserId],
    queryFn: () => listMyBlockedUsers(currentUserId as string),
    enabled: !!currentUserId
  });
}
