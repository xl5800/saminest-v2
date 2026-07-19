import { useQuery } from "@tanstack/react-query";

import {
  type AdminPostListItem,
  listPendingPosts
} from "../../repositories/posts-repository";

export const PENDING_POSTS_QUERY_KEY = ["admin", "pending-posts"] as const;

/**
 * 管理员待审核帖子队列。approve/reject 成功后页面直接从本地列表里移除
 * 处理过的行（见 pending-posts-page.tsx），不依赖这个查询重新 fetch 来
 * 更新 UI，所以这里不需要短的 staleTime/自动重新请求之类的配置。
 */
export function usePendingPostsQuery() {
  return useQuery<AdminPostListItem[]>({
    queryKey: PENDING_POSTS_QUERY_KEY,
    queryFn: () => listPendingPosts()
  });
}
