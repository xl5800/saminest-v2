import { useQuery } from "@tanstack/react-query";

import { listFavoritedPostIds } from "../../repositories/favorites-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户收藏过的帖子 id 列表，用来判断某个帖子是否已被收藏
 * （见 FavoriteButton）。没有登录用户时禁用查询，不发请求、不报错。
 */
export function useFavoritePostIdsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<string[]>({
    queryKey: ["favorites", userId],
    queryFn: () => listFavoritedPostIds(userId as string),
    enabled: !!userId
  });
}
