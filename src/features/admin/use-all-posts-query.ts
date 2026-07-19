import { useQuery } from "@tanstack/react-query";

import {
  type AdminPostListItem,
  listAllPosts
} from "../../repositories/posts-repository";

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all），支持可选的 status 过滤。
 * queryKey 把 statusFilter 拼进去（未选择时用 "all" 占位），切换过滤器
 * 相当于切到一份新的查询缓存，不需要手动 invalidate——跟 use-reports-query.ts
 * 用 status 拼 queryKey 是同一个模式。
 */
export function useAllPostsQuery(statusFilter?: string) {
  return useQuery<AdminPostListItem[]>({
    queryKey: ["admin", "all-posts", statusFilter ?? "all"],
    queryFn: () => listAllPosts(statusFilter)
  });
}
