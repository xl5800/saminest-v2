import { useQuery } from "@tanstack/react-query";

import {
  listFavoritedCommunityPosts,
  type CommunityPostListItem
} from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";

/** "我的收藏"页面"社区"标签：收藏过的社区帖子（收藏列表补全任务卡）。 */
export function useFavoritedCommunityPostsQuery(enabled = true) {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<CommunityPostListItem[]>({
    queryKey: ["favorited-community-posts", userId],
    queryFn: () => listFavoritedCommunityPosts(userId as string),
    enabled: enabled && !!userId
  });
}
