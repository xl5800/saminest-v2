import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminApproveCommunity, adminRejectCommunity } from "../../repositories/admin-repository";
import { ADMIN_COMMUNITY_REQUESTS_QUERY_KEY } from "./use-admin-community-requests-query";

/**
 * 审核社区申请成功后：刷新管理后台申请列表；通过的社区会出现在公开社区列表里，
 * 所以同时失效 ["communities"]（浏览页 / 搜索页的社区列表）。
 */
function useInvalidateAfterReview() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_COMMUNITY_REQUESTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["communities"] });
  };
}

export function useAdminApproveCommunityMutation() {
  const invalidate = useInvalidateAfterReview();
  return useMutation({
    mutationFn: (communityId: string) => adminApproveCommunity(communityId),
    onSuccess: invalidate
  });
}

export interface AdminRejectCommunityInput {
  communityId: string;
  rejectionNote: string;
}

export function useAdminRejectCommunityMutation() {
  const invalidate = useInvalidateAfterReview();
  return useMutation({
    mutationFn: (input: AdminRejectCommunityInput) =>
      adminRejectCommunity(input.communityId, input.rejectionNote),
    onSuccess: invalidate
  });
}
