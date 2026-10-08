import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  addCommunityPostFavorite,
  removeCommunityPostFavorite
} from "../../repositories/favorites-repository";

export interface ToggleCommunityPostFavoriteInput {
  userId: string;
  communityPostId: string;
  isCurrentlyFavorited: boolean;
}

/**
 * 收藏/取消收藏社区帖子的开关，结构照抄 use-toggle-favorite-mutation.ts。
 * 成功后失效三份缓存：["community-post-favorites", userId]（按钮判断是否已
 * 收藏用的 id 列表）；["community-posts"]（Feed 卡片上的收藏数——
 * community_posts.favorite_count 由数据库触发器维护，Feed 缓存里的数字
 * 需要重新拉取）；["community-post-detail", id]（详情页同理）。
 */
export function useToggleCommunityPostFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleCommunityPostFavoriteInput) => {
      if (input.isCurrentlyFavorited) {
        await removeCommunityPostFavorite({
          userId: input.userId,
          communityPostId: input.communityPostId
        });
      } else {
        await addCommunityPostFavorite({
          userId: input.userId,
          communityPostId: input.communityPostId
        });
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["community-post-favorites", variables.userId]
      });
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.invalidateQueries({
        queryKey: ["community-post-detail", variables.communityPostId]
      });
    }
  });
}
