import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addFavorite, removeFavorite } from "../../repositories/favorites-repository";

export interface ToggleFavoriteInput {
  userId: string;
  postId: string;
  isCurrentlyFavorited: boolean;
}

/**
 * 收藏/取消收藏的开关：根据调用方传入的当前收藏状态决定调 addFavorite 还是
 * removeFavorite，成功后让 ["favorites", userId] 查询失效，UI 会自动刷新
 * 收藏状态（见 FavoriteButton）。
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
    }
  });
}
