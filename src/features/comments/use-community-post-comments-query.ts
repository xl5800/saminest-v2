import { useQuery } from "@tanstack/react-query";

import { listComments, type Comment } from "../../repositories/comments-repository";

export function useCommunityPostCommentsQuery(communityPostId: string) {
  return useQuery<Comment[]>({
    queryKey: ["community-post-comments", communityPostId],
    queryFn: () => listComments({ communityPostId })
  });
}
