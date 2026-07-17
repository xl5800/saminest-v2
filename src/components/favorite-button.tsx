import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useFavoritePostIdsQuery } from "../features/favorites/use-favorite-post-ids-query";
import { useToggleFavoriteMutation } from "../features/favorites/use-toggle-favorite-mutation";
import { useAuthStore } from "../store/auth-store";

export interface FavoriteButtonProps {
  postId: string;
}

/**
 * 收藏按钮：列表项和详情页都会用到，可能嵌套在 <Link> 里面（见
 * PostList），所以点击时要 preventDefault + stopPropagation，避免同时
 * 触发外层的导航。
 *
 * 未登录点击只是跳去 /login，不发起任何收藏请求、也不报错——这里不做
 * "登录后回跳"，见任务范围说明。
 */
export function FavoriteButton({ postId }: FavoriteButtonProps) {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: favoritedPostIds } = useFavoritePostIdsQuery();
  const toggleFavorite = useToggleFavoriteMutation();

  const isFavorited = Boolean(userId) && (favoritedPostIds ?? []).includes(postId);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!userId) {
      navigate("/login");
      return;
    }

    if (toggleFavorite.isPending) return;

    toggleFavorite.mutate({
      userId,
      postId,
      isCurrentlyFavorited: isFavorited
    });
  }

  return (
    <button
      type="button"
      aria-pressed={isFavorited}
      disabled={toggleFavorite.isPending}
      onClick={handleClick}
    >
      {isFavorited ? "★ 已收藏" : "☆ 收藏"}
    </button>
  );
}
