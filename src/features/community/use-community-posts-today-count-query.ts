import { useQuery } from "@tanstack/react-query";

import { countCommunityPostsSince } from "../../repositories/community-repository";

/** 当前设备本地时区的"今天 0 点"。 */
function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 某个社区"今日新帖子数"（社区浏览页卡片上的"今日 N 个新帖子"）。"今日"
 * 取观看者设备本地时区的当天 0 点——跟 formatActivityStartAt 之类"用户关心
 * 的是自己这一天"的展示是同一个考虑，不用 UTC 日历日（那样美东用户晚上 8 点
 * 之后看到的"今日"会是明天）。
 *
 * queryKey 带上本地日期字符串：同一个会话跨过午夜继续开着页面时，新的一天
 * 会换一个 key 重新查，不会一直吃着昨天的缓存；同一天内走默认 staleTime。
 */
export function useCommunityPostsTodayCountQuery(communityId: string | undefined) {
  const dayStart = startOfLocalDay(new Date());
  const dayKey = `${dayStart.getFullYear()}-${dayStart.getMonth() + 1}-${dayStart.getDate()}`;

  return useQuery({
    queryKey: ["community-posts-today-count", communityId, dayKey],
    queryFn: () => countCommunityPostsSince(communityId as string, dayStart.toISOString()),
    enabled: Boolean(communityId)
  });
}
