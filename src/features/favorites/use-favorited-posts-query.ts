import { useQuery } from "@tanstack/react-query";

import { listFavoritedPosts } from "../../repositories/favorites-repository";
import type { PostListItem } from "../../repositories/posts-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 收藏列表页（/favorites）用：当前登录用户收藏的帖子完整列表（含标题/价格/
 * 地区等展示字段），跟 useFavoritePostIdsQuery（只返回 id 数组，供
 * FavoriteButton 判断某个帖子是否已收藏）不是同一个查询，用不同的
 * queryKey，互不影响缓存。
 *
 * 没有登录用户时禁用查询——这个 hook 只会在 /favorites 页面使用，而该路由
 * 已经被 RequireAuth 包裹，这里的 enabled 只是防御性的，不承担鉴权职责。
 */
export function useFavoritedPostsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<PostListItem[]>({
    queryKey: ["favorited-posts", userId],
    queryFn: () => listFavoritedPosts(userId as string),
    enabled: !!userId
  });
}
