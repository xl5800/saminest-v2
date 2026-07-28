import { useInfiniteQuery } from "@tanstack/react-query";

import { listApprovedPosts } from "../../repositories/posts-repository";

export const DEFAULT_POSTS_PAGE_SIZE = 20;

export interface UsePostsInfiniteQueryInput {
  categoryId?: string;
  searchQuery?: string;
  pageSize?: number;
}

/**
 * 可复用的帖子无限滚动查询 hook：现在给首页/分类页用，以后"我的帖子"、
 * "收藏列表"等页面需要类似的列表时，同样从这里（或加参数）复用，不要在
 * 每个页面里各写一遍 useInfiniteQuery + Supabase 查询。
 *
 * 用 useInfiniteQuery 而不是分页按钮版的 useQuery：page 不再是外部传入的
 * 状态，而是内部靠 pageParam 从 0 开始自增——listApprovedPosts 本身早就是
 * "传 page/pageSize、返回 hasNextPage" 的形状（用多取一条判断有没有下一页，
 * 不额外发 COUNT(*)，见 posts-repository.ts 里的注释），天然适合直接喂给
 * getNextPageParam，不需要改 repository 这一层。
 *
 * searchQuery 跟 categoryId 一样进 queryKey：搜索词变了要算一个新的缓存条目
 * （不能复用上一个搜索词已经加载的若干页结果），TanStack Query 靠 queryKey
 * 里的值变化自动重置到第一页，不需要手动重置任何本地状态。
 */
export function usePostsInfiniteQuery(input: UsePostsInfiniteQueryInput) {
  const pageSize = input.pageSize ?? DEFAULT_POSTS_PAGE_SIZE;
  const { categoryId, searchQuery } = input;

  return useInfiniteQuery({
    queryKey: [
      "posts",
      { categoryId: categoryId ?? null, searchQuery: searchQuery ?? null, pageSize }
    ],
    queryFn: ({ pageParam }) =>
      listApprovedPosts({ categoryId, searchQuery, page: pageParam, pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasNextPage ? lastPageParam + 1 : undefined
  });
}
