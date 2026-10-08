import { useQuery } from "@tanstack/react-query";

import { getCommunityPostDetail } from "../../repositories/community-repository";

export function useCommunityPostDetailQuery(id: string) {
  return useQuery({
    queryKey: ["community-post-detail", id],
    queryFn: () => getCommunityPostDetail(id)
  });
}
