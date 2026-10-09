import { useQuery } from "@tanstack/react-query";

import { searchCommunityPosts } from "../../repositories/community-repository";

/** 全站搜索页的社区帖子搜索。关键词为空时不发请求。 */
export function useSearchCommunityPostsQuery(keyword: string) {
  const trimmed = keyword.trim();
  return useQuery({
    queryKey: ["community-posts", "search", trimmed],
    queryFn: () => searchCommunityPosts(trimmed),
    enabled: trimmed.length > 0
  });
}
