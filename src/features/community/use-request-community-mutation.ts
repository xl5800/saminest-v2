import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestCommunity } from "../../repositories/community-repository";
import { MY_COMMUNITY_REQUESTS_QUERY_KEY } from "./use-my-community-requests-query";

/** 提交创建社区申请；成功后刷新"我的申请"列表。 */
export function useRequestCommunityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestCommunity,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MY_COMMUNITY_REQUESTS_QUERY_KEY] });
    }
  });
}
