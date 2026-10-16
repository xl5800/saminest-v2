import { useQuery } from "@tanstack/react-query";

import { listLikedCommunityPostIds } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 社区帖子点赞任务卡：当前用户赞过的社区帖子 id，点赞按钮判断亮不亮用。
 * 跟 useCommunityPostFavoriteIdsQuery 同一个模式（一次查出全部 id，各个
 * 按钮共用同一份缓存）。
 */
export function useLikedCommunityPostIdsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<string[]>({
    queryKey: ["community-post-likes", userId],
    queryFn: () => listLikedCommunityPostIds(userId as string),
    enabled: !!userId
  });
}
