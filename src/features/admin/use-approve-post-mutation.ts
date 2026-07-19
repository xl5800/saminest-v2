import { useMutation } from "@tanstack/react-query";

import { approvePost } from "../../repositories/admin-repository";

/**
 * 通过一个待审核帖子。这里不 invalidateQueries 待审核列表——产品明确要求
 * "通过/驳回后直接把这一条从当前列表里移除，不用刷新整个页面"，页面在
 * mutateAsync 成功后自己维护本地列表状态（见 pending-posts-page.tsx），
 * 不依赖重新 fetch 来更新 UI。
 */
export function useApprovePostMutation() {
  return useMutation({
    mutationFn: (postId: string) => approvePost(postId)
  });
}
