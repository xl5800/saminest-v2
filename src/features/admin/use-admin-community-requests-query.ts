import { useQuery } from "@tanstack/react-query";

import {
  type AdminCommunityRequest,
  type CommunityRequestStatus,
  listCommunityRequestsForAdmin
} from "../../repositories/community-repository";

export const ADMIN_COMMUNITY_REQUESTS_QUERY_KEY = ["admin", "community-requests"] as const;

/** 管理后台"社区申请"列表，按状态筛选（默认只看审核中）。 */
export function useAdminCommunityRequestsQuery(statusFilter?: CommunityRequestStatus) {
  return useQuery<AdminCommunityRequest[]>({
    queryKey: [...ADMIN_COMMUNITY_REQUESTS_QUERY_KEY, statusFilter ?? "all"],
    queryFn: () => listCommunityRequestsForAdmin(statusFilter)
  });
}
