import { useMutation, useQueryClient } from "@tanstack/react-query";

import { likeCommunityPost, unlikeCommunityPost } from "../../repositories/community-repository";
import { track } from "../analytics/track";

export interface ToggleCommunityPostLikeInput {
  userId: string;
  communityPostId: string;
  isCurrentlyLiked: boolean;
}

/**
 * 社区帖子点赞任务卡：点赞 / 取消点赞。按钮自己先把图标和数字改掉（不等
 * 服务器，手感更快，见 community-post-like-button.tsx），成功后这里刷新
 * "我赞过哪些"和帖子列表/详情里的点赞数，跟服务器对齐。
 */
export function useToggleCommunityPostLikeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleCommunityPostLikeInput) => {
      const target = { userId: input.userId, communityPostId: input.communityPostId };
      if (input.isCurrentlyLiked) {
        await unlikeCommunityPost(target);
      } else {
        await likeCommunityPost(target);
      }
    },
    onSuccess: (_result, variables) => {
      if (!variables.isCurrentlyLiked) track("content_liked", { type: "community_post" });
    },
    onSettled: (_result, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["community-post-likes", variables.userId] });
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.invalidateQueries({
        queryKey: ["community-post-detail", variables.communityPostId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["favorited-community-posts", variables.userId]
      });
    }
  });
}
