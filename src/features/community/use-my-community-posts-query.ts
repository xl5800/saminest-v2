import { useQuery } from "@tanstack/react-query";

import { listMyCommunityPosts } from "../../repositories/community-repository";

export function useMyCommunityPostsQuery(authorId: string | undefined) {
  return useQuery({
    queryKey: ["my-community-posts", authorId ?? null],
    queryFn: () => listMyCommunityPosts(authorId as string),
    enabled: Boolean(authorId)
  });
}
