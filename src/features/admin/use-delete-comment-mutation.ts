import { useMutation } from "@tanstack/react-query";

import { deleteComment } from "../../repositories/admin-repository";

export interface DeleteCommentMutationInput {
  commentId: string;
  deleteReason: string;
}

/**
 * 删除一条评论（软删除，走 delete_comment RPC）。不 invalidateQueries——理由
 * 同 use-delete-post-mutation.ts：唯一调用方 reports-page.tsx 成功后自己从
 * 本地列表移除对应举报行，不依赖这个 mutation 触发任何列表重新拉取。
 * UGC 安全功能补齐任务卡 4。
 */
export function useDeleteCommentMutation() {
  return useMutation({
    mutationFn: (input: DeleteCommentMutationInput) =>
      deleteComment(input.commentId, input.deleteReason)
  });
}
