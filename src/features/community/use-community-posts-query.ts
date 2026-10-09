import { useInfiniteQuery } from "@tanstack/react-query";

import { listCommunityPosts } from "../../repositories/community-repository";

export const DEFAULT_COMMUNITY_POSTS_PAGE_SIZE = 20;

/**
 * 社区帖子无限滚动列表。communityIds：
 * - undefined：还没有可查的范围（社区/已加入列表还在加载），查询被 enabled 挡住；
 * - "all"：不按社区过滤（首页"一个社区都没加入"的兜底）；
 * - 一组 id：只查这些社区（单个社区 Feed 页传 [id]，首页个性化传已加入的全部）。
 *
 * queryKey 的第二项用排序后的 id 串（或 "all"）——同一批社区不管 id 顺序怎么变
 * 都命中同一份缓存；所有失效逻辑都用 ["community-posts"] 前缀匹配，不依赖
 * 第二项的具体形状。
 */
export function useCommunityPostsInfiniteQuery(communityIds: string[] | "all" | undefined) {
  const scopeKey =
    communityIds === undefined
      ? null
      : communityIds === "all"
        ? "all"
        : [...communityIds].sort().join(",");

  return useInfiniteQuery({
    queryKey: ["community-posts", scopeKey],
    queryFn: ({ pageParam }) =>
      listCommunityPosts({
        communityIds: communityIds as string[] | "all",
        page: pageParam,
        pageSize: DEFAULT_COMMUNITY_POSTS_PAGE_SIZE
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasNextPage ? lastPageParam + 1 : undefined,
    enabled: communityIds !== undefined
  });
}
