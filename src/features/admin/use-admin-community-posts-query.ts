import { useQuery } from "@tanstack/react-query";

import {
  type AdminCommunityPostListItem,
  listCommunityPostsForAdmin
} from "../../repositories/community-repository";

export const ADMIN_COMMUNITY_POSTS_QUERY_KEY = ["admin", "community-posts"] as const;

/**
 * 管理后台「全部帖子 → 社区帖子」列表。queryKey 拼上状态和搜索词，切换任一
 * 筛选条件就是一份新的缓存，跟 use-all-posts-query.ts 同一个模式。
 */
export function useAdminCommunityPostsQuery(
  statusFilter?: string,
  searchQuery?: string,
  options: { enabled?: boolean } = {}
) {
  return useQuery<AdminCommunityPostListItem[]>({
    queryKey: [...ADMIN_COMMUNITY_POSTS_QUERY_KEY, statusFilter ?? "all", searchQuery ?? ""],
    queryFn: () => listCommunityPostsForAdmin(statusFilter, searchQuery),
    enabled: options.enabled ?? true
  });
}
