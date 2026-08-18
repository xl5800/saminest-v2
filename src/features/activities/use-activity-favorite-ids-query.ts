import { useQuery } from "@tanstack/react-query";

import { listFavoritedActivityIds } from "../../repositories/favorites-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户收藏过的活动 id 列表，用来判断某个活动是否已被收藏（见
 * ActivityFavoriteButton）——跟 use-favorite-post-ids-query.ts 是同一个
 * 模式，只是查的是 activity_id。放在 features/activities/ 而不是
 * features/favorites/：这个 hook 只服务于活动详情页的收藏按钮，跟同目录
 * 下 use-activity-participation-query.ts 等其它"活动详情页专用 hook"是
 * 同一类东西，比塞进目前只装帖子收藏 hook 的 features/favorites/ 更贴合
 * 现有的目录划分方式。没有登录用户时禁用查询，不发请求、不报错。
 */
export function useActivityFavoriteIdsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<string[]>({
    queryKey: ["activity-favorites", userId],
    queryFn: () => listFavoritedActivityIds(userId as string),
    enabled: !!userId
  });
}
