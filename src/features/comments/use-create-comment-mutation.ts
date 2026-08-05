import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createComment,
  type CreateCommentInput
} from "../../repositories/comments-repository";

/**
 * 发表评论/回复（parentId 是 null 还是某条评论的 id，由调用方决定，这个
 * mutation 不区分"顶层评论"和"回复"，两者是同一个 insert）。
 *
 * 成功后 invalidate 两个 queryKey：
 * - ["post-comments", postId]：让评论列表重新拉取，展示刚发的这一条。
 * - ["post-detail", postId]：帖子详情页头部展示的评论数（commentCount）
 *   来自 posts.comment_count，由数据库触发器同步更新，不是从
 *   ["post-comments", ...] 这份数据本地现算出来的（见
 *   comment-section.tsx 里"数量从 usePostDetailQuery 传进来，不在组件
 *   内部自己 comments.length"的说明），必须单独失效这个 queryKey 才能让
 *   头部的数字跟着刷新。
 */
export function useCreateCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(input),
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
