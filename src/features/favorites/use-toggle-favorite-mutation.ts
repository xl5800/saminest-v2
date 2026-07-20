import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addFavorite, removeFavorite } from "../../repositories/favorites-repository";

export interface ToggleFavoriteInput {
  userId: string;
  postId: string;
  isCurrentlyFavorited: boolean;
}

/**
 * 收藏/取消收藏的开关：根据调用方传入的当前收藏状态决定调 addFavorite 还是
 * removeFavorite，成功后让 ["favorites", userId]（FavoriteButton 用来判断
 * 是否已收藏的 id 列表）和 ["favorited-posts", userId]（/favorites 页面的
 * 完整收藏列表，见 use-favorited-posts-query.ts）两个查询都失效，UI 会自动
 * 刷新——这两个 key 都以同一个 userId 为收藏关系的作用域，切换收藏状态时
 * 理应同时刷新，不需要调用方分别处理。
 */
export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleFavoriteInput) => {
      if (input.isCurrentlyFavorited) {
        await removeFavorite({ userId: input.userId, postId: input.postId });
      } else {
        await addFavorite({ userId: input.userId, postId: input.postId });
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["favorites", variables.userId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["favorited-posts", variables.userId]
      });
    }
  });
}
