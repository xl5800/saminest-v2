import { useQuery } from "@tanstack/react-query";

import {
  type AdminPostListItem,
  listAllPosts
} from "../../repositories/posts-repository";

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all），支持可选的 status/
 * category/search 过滤。queryKey 把三个筛选值都拼进去（未选择时分别用
 * "all"/"all"/"" 占位），切换任意一个筛选条件相当于切到一份新的查询缓存，
 * 不需要手动 invalidate——跟 use-reports-query.ts 用 status 拼 queryKey
 * 是同一个模式。"全部帖子"管理页扩展成能管理所有内容任务卡：新增
 * categoryId/searchQuery 两个参数，不带的话切换分类/搜索词不会触发重新
 * 查询（TanStack Query 靠 queryKey 的引用/值变化决定要不要重新发请求）。
 */
export function useAllPostsQuery(
  statusFilter?: string,
  categoryId?: string,
  searchQuery?: string
) {
  return useQuery<AdminPostListItem[]>({
    queryKey: [
      "admin",
      "all-posts",
      statusFilter ?? "all",
      categoryId ?? "all",
      searchQuery ?? ""
    ],
    queryFn: () => listAllPosts(statusFilter, categoryId, searchQuery)
  });
}
