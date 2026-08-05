import { useMutation, useQueryClient } from "@tanstack/react-query";

import { softDeleteComment } from "../../repositories/comments-repository";

export interface DeleteCommentMutationInput {
  commentId: string;
  userId: string;
  // softDeleteComment 本身只需要 commentId/userId，但 onSuccess 要失效
  // ["post-comments", postId] / ["post-detail", postId] 这两个 queryKey，
  // 所以 postId 也作为入参传进来，避免这个 hook 反过来还要去猜/查一次
  // 这条评论属于哪个帖子。
  postId: string;
}

/**
 * 用户软删除自己的一条评论。成功后 invalidate 两个 queryKey，理由跟
 * use-create-comment-mutation.ts 完全一致：评论列表要重新拉取（展示成
 * "该评论已删除"占位），posts.comment_count 由数据库触发器同步减一，
 * 详情页头部的评论数也要跟着刷新。
 */
export function useDeleteCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteCommentMutationInput) =>
      softDeleteComment(input.commentId, input.userId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["post-comments", variables.postId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["post-detail", variables.postId]
      });
    }
  });
}
