import { useMutation, useQueryClient } from "@tanstack/react-query";

import { leaveCommunity } from "../../repositories/community-repository";
import { applyCommunityMembershipChange } from "./use-join-community-mutation";

/** 退出社区。缓存处理跟加入完全对称，见 applyCommunityMembershipChange。 */
export function useLeaveCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveCommunity,
    onSuccess: (_data, input) => {
      applyCommunityMembershipChange(queryClient, input, false);
    }
  });
}
