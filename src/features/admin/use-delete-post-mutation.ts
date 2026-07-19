import { useMutation } from "@tanstack/react-query";

import { deletePost } from "../../repositories/admin-repository";

export interface DeletePostMutationInput {
  postId: string;
  deleteReason: string;
}

/**
 * 删除一个帖子（软删除，走 delete_post RPC）。不 invalidateQueries——理由同
 * use-approve-post-mutation.ts，调用方（all-posts-page.tsx / reports-page.tsx）
 * 成功后自己从本地列表移除对应行。
 */
export function useDeletePostMutation() {
  return useMutation({
    mutationFn: (input: DeletePostMutationInput) =>
      deletePost(input.postId, input.deleteReason)
  });
}
