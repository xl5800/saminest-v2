import { useQuery } from "@tanstack/react-query";

import { searchCommunityPosts } from "../../repositories/community-repository";

interface SearchCommunityPostsOptions {
  /** 只搜这个社区（单个社区页的社区内搜索）；不传就是全站搜索。 */
  communityId?: string;
  /** 社区内搜索要等社区 id 加载出来才能发请求，否则会退化成全站搜索。 */
  enabled?: boolean;
}

/** 社区帖子搜索（全站搜索页 / 社区内搜索）。关键词为空时不发请求。 */
export function useSearchCommunityPostsQuery(
  keyword: string,
  options: SearchCommunityPostsOptions = {}
) {
  const trimmed = keyword.trim();
  const { communityId, enabled = true } = options;
  return useQuery({
    queryKey: ["community-posts", "search", communityId ?? "all", trimmed],
    queryFn: () => searchCommunityPosts(trimmed, communityId),
    enabled: enabled && trimmed.length > 0
  });
}
