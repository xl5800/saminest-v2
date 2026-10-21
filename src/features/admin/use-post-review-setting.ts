import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getPostReviewEnabled, setPostReviewEnabled } from "../../repositories/admin-repository";

export const POST_REVIEW_SETTING_QUERY_KEY = ["admin", "post-review-enabled"] as const;

/** 后台「待审核」页顶部的发帖审核开关：读当前设置。 */
export function usePostReviewEnabledQuery() {
  return useQuery<boolean>({
    queryKey: POST_REVIEW_SETTING_QUERY_KEY,
    queryFn: () => getPostReviewEnabled()
  });
}

/** 改发帖审核开关，成功后直接更新缓存里的值。 */
export function useSetPostReviewEnabledMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setPostReviewEnabled(enabled),
    onSuccess: (_data, enabled) => {
      queryClient.setQueryData(POST_REVIEW_SETTING_QUERY_KEY, enabled);
    }
  });
}
