import { useMutation } from "@tanstack/react-query";

import { rejectPost } from "../../repositories/admin-repository";

export interface RejectPostMutationInput {
  postId: string;
  rejectionNote: string;
}

/**
 * 驳回一个待审核帖子，理由同 use-approve-post-mutation.ts：不
 * invalidateQueries 待审核列表，页面成功后自己从本地列表移除这一行。
 */
export function useRejectPostMutation() {
  return useMutation({
    mutationFn: (input: RejectPostMutationInput) =>
      rejectPost(input.postId, input.rejectionNote)
  });
}
