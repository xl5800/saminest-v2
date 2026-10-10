import { useQuery } from "@tanstack/react-query";

import { listMyCommunityRequests } from "../../repositories/community-repository";

export const MY_COMMUNITY_REQUESTS_QUERY_KEY = "my-community-requests";

/** 当前用户提交过的社区申请（创建社区页下方"我的申请"）。游客不发请求。 */
export function useMyCommunityRequestsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: [MY_COMMUNITY_REQUESTS_QUERY_KEY, userId],
    queryFn: () => listMyCommunityRequests(userId as string),
    enabled: Boolean(userId),
    staleTime: 0
  });
}
