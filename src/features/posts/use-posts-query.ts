import { useQuery } from "@tanstack/react-query";

import {
  listApprovedPosts,
  type ListApprovedPostsResult
} from "../../repositories/posts-repository";

export const DEFAULT_POSTS_PAGE_SIZE = 20;

export interface UsePostsQueryInput {
  categoryId?: string;
  searchQuery?: string;
  page: number;
  pageSize?: number;
}

/**
 * 可复用的帖子列表查询 hook：现在给首页/分类页用，以后"我的帖子"、
 * "收藏列表"等页面需要类似的分页列表时，同样从这里（或加参数）复用，
 * 不要在每个页面里各写一遍 useQuery + Supabase 查询。
 *
 * searchQuery 跟 categoryId 一样进 queryKey：搜索词变了要算一个新的缓存条目
 * （不能复用上一个搜索词的分页结果），TanStack Query 靠 queryKey 里的值
 * 变化来判断要不要重新发请求，这里不需要手动 invalidate。
 */
export function usePostsQuery(input: UsePostsQueryInput) {
  const pageSize = input.pageSize ?? DEFAULT_POSTS_PAGE_SIZE;
  const { categoryId, searchQuery, page } = input;

  return useQuery<ListApprovedPostsResult>({
    queryKey: [
      "posts",
      { categoryId: categoryId ?? null, searchQuery: searchQuery ?? null, page, pageSize }
    ],
    queryFn: () => listApprovedPosts({ categoryId, searchQuery, page, pageSize })
  });
}
