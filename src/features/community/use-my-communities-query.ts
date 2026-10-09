import { useQuery } from "@tanstack/react-query";

import { listMyCommunities } from "../../repositories/community-repository";

export const MY_COMMUNITIES_QUERY_KEY = "my-communities";

/**
 * 当前用户已加入的全部社区：首页判断"走个性化还是全部社区兜底"、发帖页
 * "选择社区"下拉框、社区浏览页"我的社区"Tab 共用。游客（没有 userId）不发请求，
 * 调用方把 data 为 undefined 的游客当"一个社区都没加入"处理。
 *
 * staleTime 显式设成 0：用户可能在浏览页刚点了"加入"再回到首页，吃着缓存会
 * 让首页还显示"零加入"兜底；加入的 mutation 也会主动 invalidate 这个 key（见
 * use-join-community-mutation.ts），这里设 0 是双保险。
 */
export function useMyCommunitiesQuery(userId: string | undefined) {
  return useQuery({
    queryKey: [MY_COMMUNITIES_QUERY_KEY, userId],
    queryFn: () => listMyCommunities(userId as string),
    enabled: Boolean(userId),
    staleTime: 0
  });
}
