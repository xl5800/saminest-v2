import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  softDeleteComment,
  type CommentTarget
} from "../../repositories/comments-repository";

export type DeleteCommentMutationInput = CommentTarget & {
  commentId: string;
  userId: string;
  // softDeleteComment 本身只需要 commentId/userId，但 onSuccess 要失效
  // 帖子/活动各自的两个 queryKey，所以 target（postId 或 activityId）也
  // 作为入参传进来，避免这个 hook 反过来还要去猜/查一次这条评论挂在哪
  // 个帖子/活动下面。
};

/**
 * 用户软删除自己的一条评论。同时服务帖子评论区和活动留言区（找搭子留言区
 * 任务卡泛化），理由跟 use-create-comment-mutation.ts 完全一致——
 * comment-item.tsx 的删除按钮不应该分叉成两个 hook。
 *
 * 成功后按 variables 里到底是 postId 还是 activityId，invalidate 对应的
 * 两个 queryKey：postId 分支跟改动前逐字一致（["post-comments", postId] +
 * ["post-detail", postId]）；activityId 分支是
 * ["activity-comments", activityId] + ["activity-detail", activityId]——
 * 评论列表要重新拉取（展示成"该评论已删除"占位），comment_count 由数据库
 * 触发器同步减一，详情页头部的留言数也要跟着刷新。
 */
export function useDeleteCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteCommentMutationInput) =>
      softDeleteComment(input.commentId, input.userId),
    onSuccess: (_data, variables) => {
      if ("postId" in variables) {
        void queryClient.invalidateQueries({
          queryKey: ["post-comments", variables.postId]
        });
        void queryClient.invalidateQueries({
          queryKey: ["post-detail", variables.postId]
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["activity-comments", variables.activityId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["activity-detail", variables.activityId]
      });
    }
  });
}
