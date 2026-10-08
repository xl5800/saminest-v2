import { useQuery } from "@tanstack/react-query";

import { listFavoritedCommunityPostIds } from "../../repositories/favorites-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户收藏过的社区帖子 id 列表，用来判断某个社区帖子是否已被收藏
 * （见 CommunityPostFavoriteButton）——跟 use-favorite-post-ids-query.ts 是同一个
 * 模式，只是查的是 community_post_id。没有登录用户时禁用查询，不发请求、不报错。
 */
export function useCommunityPostFavoriteIdsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<string[]>({
    queryKey: ["community-post-favorites", userId],
    queryFn: () => listFavoritedCommunityPostIds(userId as string),
    enabled: !!userId
  });
}
