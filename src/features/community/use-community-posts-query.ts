import { useInfiniteQuery } from "@tanstack/react-query";

import { listCommunityPosts } from "../../repositories/community-repository";

export const DEFAULT_COMMUNITY_POSTS_PAGE_SIZE = 20;

export function useCommunityPostsInfiniteQuery(communityId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["community-posts", communityId ?? null],
    queryFn: ({ pageParam }) =>
      listCommunityPosts({
        communityId: communityId as string,
        page: pageParam,
        pageSize: DEFAULT_COMMUNITY_POSTS_PAGE_SIZE
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasNextPage ? lastPageParam + 1 : undefined,
    enabled: Boolean(communityId)
  });
}
